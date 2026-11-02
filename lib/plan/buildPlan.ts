import type { SupabaseClient } from "@supabase/supabase-js";
import { gatherPlanInput, formatOffersCompact, formatPantryCompact } from "./gatherInput";
import { generateMealPlan, fixMealPlan, type PlannerMeal } from "@/lib/ai/planGenerate";
import { resolveIngredients } from "./resolveIngredients";
import { computePlanStatus } from "./computeStatus";
import type { MacroMode, WeekMealGrid, MealType } from "./types";

export type BuildPlanParams = {
  weekStart: string; // ÅÅÅÅ-MM-DD (mandag)
  mealGrid: WeekMealGrid;
  macroModes: Record<string, MacroMode>;
  budget: number;
  budgetType: "loft" | "mål";
  wishes: string;
  maxStores: number;
  primaryStoreId: string | null;
};

type LockedMeal = {
  id: string;
  date: string;
  meal_type: MealType;
  recipe_id: string;
  servings: number;
  recipes: { title: string; description: string | null; base_servings: number; prep_minutes: number | null; steps: string[] } | null;
};

function slotsToFill(mealGrid: WeekMealGrid, locked: LockedMeal[]): { date: string; meal_type: MealType }[] {
  const lockedKeys = new Set(locked.map((l) => `${l.date}|${l.meal_type}`));
  const slots: { date: string; meal_type: MealType }[] = [];
  for (const [date, meals] of Object.entries(mealGrid)) {
    for (const [mealType, cell] of Object.entries(meals)) {
      if (!cell?.on) continue;
      if (cell.leftover && mealType === "frokost") continue;
      if (lockedKeys.has(`${date}|${mealType}`)) continue;
      slots.push({ date, meal_type: mealType as MealType });
    }
  }
  return slots;
}

function buildUserMessage(
  input: Awaited<ReturnType<typeof gatherPlanInput>>,
  slots: { date: string; meal_type: MealType }[],
  locked: LockedMeal[],
): string {
  const peopleLines = input.people
    .map((p) => `${p.id} | ${p.name} | mål: ${p.kcal} kcal, ${p.protein_g} g protein, ${p.carbs_g} g kulhydrat, ${p.fat_g} g fedt | tilstand: ${p.macroMode}`)
    .join("\n");

  const slotsLines = slots.map((s) => `${s.date} ${s.meal_type}`).join("\n");
  const lockedLines = locked.map((l) => `${l.date} ${l.meal_type}: ${l.recipes?.title ?? "?"} (LÅST, foreslå ikke denne)`).join("\n");

  return `MÅLTIDER, DER SKAL FORESLÅS:\n${slotsLines || "(ingen)"}\n\nLÅSTE MÅLTIDER (til kontekst, må ikke ændres):\n${lockedLines || "(ingen)"}\n\nPERSONER:\n${peopleLines}\n\nMaks. tilberedningstid på hverdage: ${input.settings.maxPrepWeekdayMin} minutter.\nTing vi ikke spiser: ${input.settings.dislikes.join(", ") || "ingen"}.\nAllergier: ${input.settings.allergies.join(", ") || "ingen"}.\n\nTILBUD (id | navn | butik | pakke | pris | kilopris | kcal/100g | protein/100g | pris/100g protein | evt. SKAL_MED):\n${formatOffersCompact(input.offers)}\n\n${formatPantryCompact(input)}\n\nRetter fra de sidste tre uger (undgå gentagelse): ${input.recentRecipeTitles.join(", ") || "ingen"}.\nFavoritretter (gerne igen): ${input.favoriteRecipeTitles.join(", ") || "ingen"}.\n\nUgens ønsker: ${input.wishes || "ingen"}.`;
}

async function getLockedMeals(supabase: SupabaseClient, planId: string): Promise<LockedMeal[]> {
  const { data } = await supabase
    .from("planned_meals")
    .select("id, date, meal_type, recipe_id, servings, recipes(title, description, base_servings, prep_minutes, steps)")
    .eq("plan_id", planId)
    .eq("locked", true);
  return (data ?? []) as unknown as LockedMeal[];
}

async function replaceUnlockedMeals(
  supabase: SupabaseClient,
  planId: string,
  meals: PlannerMeal[],
  resolved: import("./resolveIngredients").ResolvedIngredient[],
  mealComputations: { mealIndex: number; portionFactors: Record<string, number> }[],
  statusByDate: Map<string, "grøn" | "gul" | "rød">,
) {
  const { data: oldUnlocked } = await supabase.from("planned_meals").select("id").eq("plan_id", planId).eq("locked", false);
  if (oldUnlocked && oldUnlocked.length > 0) {
    await supabase.from("planned_meals").delete().in("id", oldUnlocked.map((m) => m.id));
  }

  for (let i = 0; i < meals.length; i++) {
    const meal = meals[i];
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .insert({
        title: meal.title,
        description: meal.description ?? null,
        base_servings: meal.base_servings,
        prep_minutes: meal.prep_minutes ?? null,
        steps: meal.steps,
        created_by: "ai",
      })
      .select("id")
      .single();
    if (recipeError || !recipe) throw new Error("Kunne ikke gemme opskrift: " + recipeError?.message);

    const mealIngredients = resolved.filter((r) => r.mealIndex === i);
    await supabase.from("recipe_ingredients").insert(
      meal.ingredients.map((ing) => ({
        recipe_id: recipe.id,
        name: ing.name,
        grams_raw: ing.grams_raw,
        food_id: mealIngredients.find((r) => r.name === ing.name)?.foodId ?? null,
      })),
    );

    const { data: plannedMeal, error: plannedError } = await supabase
      .from("planned_meals")
      .insert({
        plan_id: planId,
        date: meal.date,
        meal_type: meal.meal_type,
        recipe_id: recipe.id,
        locked: false,
        servings: meal.base_servings,
        portion_factors: mealComputations[i]?.portionFactors ?? {},
        computed_status: statusByDate.get(meal.date) ?? null,
      })
      .select("id")
      .single();
    if (plannedError || !plannedMeal) throw new Error("Kunne ikke gemme måltid: " + plannedError?.message);

    if (mealIngredients.length > 0) {
      await supabase.from("planned_ingredients").insert(
        mealIngredients.map((ing) => ({
          planned_meal_id: plannedMeal.id,
          name: ing.name,
          grams_raw: ing.gramsRaw,
          source: ing.source,
          offer_id: ing.offerId,
          pantry_item_id: ing.pantryItemId,
          food_id: ing.foodId,
          cost_dkk: ing.costDkk,
        })),
      );
    }
  }
}

async function resolveComputeAndSave(
  supabase: SupabaseClient,
  planId: string,
  meals: PlannerMeal[],
  locked: LockedMeal[],
  input: Awaited<ReturnType<typeof gatherPlanInput>>,
  params: Pick<BuildPlanParams, "mealGrid" | "budget" | "budgetType" | "maxStores" | "primaryStoreId">,
) {
  const storeIds = input.offers.length > 0 ? Array.from(new Set(input.offers.map((o) => o.storeId))) : [];
  const { resolved, warnings } = await resolveIngredients(supabase, meals, params.maxStores, storeIds, params.primaryStoreId);

  const lockedAsMeals: PlannerMeal[] = locked.map((l) => ({
    date: l.date,
    meal_type: l.meal_type,
    title: l.recipes?.title ?? "",
    description: l.recipes?.description ?? null,
    base_servings: l.recipes?.base_servings ?? l.servings,
    prep_minutes: l.recipes?.prep_minutes ?? null,
    steps: l.recipes?.steps ?? [],
    ingredients: [],
  }));

  const status = await computePlanStatus(
    supabase,
    [...meals, ...lockedAsMeals],
    resolved,
    input.people,
    params.mealGrid,
    input.settings.mealShares,
    params.budget,
    params.budgetType,
  );

  const statusByDate = new Map<string, "grøn" | "gul" | "rød">();
  for (const dp of status.dayPersonStatus) {
    const current = statusByDate.get(dp.date);
    const order = { grøn: 0, gul: 1, rød: 2 } as const;
    if (!current || order[dp.evaluation.overall] > order[current]) {
      statusByDate.set(dp.date, dp.evaluation.overall);
    }
  }

  await replaceUnlockedMeals(supabase, planId, meals, resolved, status.mealComputations, statusByDate);

  return { resolved, warnings, status };
}

/** Trin 1: gem rammerne, bed Claude om forslag til de ikke-låste måltider, beregn og gem. */
export async function generatePlanDraft(supabase: SupabaseClient, params: BuildPlanParams) {
  const { data: existingPlan } = await supabase
    .from("week_plans")
    .select("id")
    .eq("week_start", params.weekStart)
    .maybeSingle();

  let planId: string;
  if (existingPlan) {
    planId = existingPlan.id;
    await supabase
      .from("week_plans")
      .update({
        budget: params.budget,
        budget_type: params.budgetType,
        macro_modes: params.macroModes,
        meal_grid: params.mealGrid,
        wishes: params.wishes,
      })
      .eq("id", planId);
  } else {
    const { data: created, error } = await supabase
      .from("week_plans")
      .insert({
        week_start: params.weekStart,
        status: "draft",
        budget: params.budget,
        budget_type: params.budgetType,
        macro_modes: params.macroModes,
        meal_grid: params.mealGrid,
        wishes: params.wishes,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error("Kunne ikke oprette ugeplan: " + error?.message);
    planId = created.id;
  }

  const locked = await getLockedMeals(supabase, planId);
  const slots = slotsToFill(params.mealGrid, locked);
  const input = await gatherPlanInput(supabase, params.macroModes, params.wishes);

  let meals: PlannerMeal[] = [];
  if (slots.length > 0) {
    const userMessage = buildUserMessage(input, slots, locked);
    const result = await generateMealPlan(supabase, userMessage);
    meals = result.meals;
  }

  const { warnings, status } = await resolveComputeAndSave(supabase, planId, meals, locked, input, params);

  await supabase
    .from("week_plans")
    .update({
      totals: {
        cost: status.totalCost,
        budgetStatus: status.budgetStatus,
        violations: status.violations,
        warnings,
        round: 0,
        dayPersonStatus: status.dayPersonStatus,
      },
    })
    .eq("id", planId);

  return { planId, violations: status.violations, warnings, totalCost: status.totalCost, budgetStatus: status.budgetStatus, round: 0 };
}

/** Trin 2 (kaldes op til to gange): beder Claude rette konkrete brud, beregner og gemmer igen. */
export async function applyPlanFixRound(supabase: SupabaseClient, planId: string) {
  const { data: plan } = await supabase.from("week_plans").select("*").eq("id", planId).single();
  if (!plan) throw new Error("Planen findes ikke.");

  const round = (plan.totals as { round?: number })?.round ?? 0;
  const previousViolations = (plan.totals as { violations?: string[] })?.violations ?? [];
  if (round >= 2 || previousViolations.length === 0) {
    return {
      planId,
      violations: previousViolations,
      warnings: (plan.totals as { warnings?: string[] })?.warnings ?? [],
      totalCost: (plan.totals as { cost?: number })?.cost ?? 0,
      budgetStatus: (plan.totals as { budgetStatus?: "grøn" | "gul" | "rød" })?.budgetStatus ?? "grøn",
      round,
      done: true,
    };
  }

  const locked = await getLockedMeals(supabase, planId);
  const { data: currentUnlocked } = await supabase
    .from("planned_meals")
    .select("date, meal_type, servings, recipes(title, description, base_servings, prep_minutes, steps, recipe_ingredients(name, grams_raw))")
    .eq("plan_id", planId)
    .eq("locked", false);

  const currentMeals: PlannerMeal[] = (currentUnlocked ?? []).map((m) => {
    const recipe = m.recipes as unknown as {
      title: string;
      description: string | null;
      base_servings: number;
      prep_minutes: number | null;
      steps: string[];
      recipe_ingredients: { name: string; grams_raw: number }[];
    } | null;
    return {
      date: m.date,
      meal_type: m.meal_type,
      title: recipe?.title ?? "",
      description: recipe?.description ?? null,
      base_servings: recipe?.base_servings ?? m.servings,
      prep_minutes: recipe?.prep_minutes ?? null,
      steps: recipe?.steps ?? [],
      ingredients: (recipe?.recipe_ingredients ?? []).map((ri) => ({
        name: ri.name,
        grams_raw: ri.grams_raw,
        source: "buy" as const,
        offer_id: null,
        pantry_item_id: null,
      })),
    };
  });

  const fixMessage = `NUVÆRENDE RETTER:\n${JSON.stringify(currentMeals)}\n\nKONKRETE BRUD, DER SKAL RETTES:\n${previousViolations.join("\n")}\n\nLÅSTE MÅLTIDER (må ikke røres):\n${locked.map((l) => `${l.date} ${l.meal_type}: ${l.recipes?.title}`).join("\n") || "(ingen)"}`;

  let meals = currentMeals;
  try {
    const fixed = await fixMealPlan(supabase, fixMessage);
    meals = fixed.meals;
  } catch {
    // Behold de nuværende retter, hvis tilretningen fejler.
  }

  const { data: settings } = await supabase.from("settings").select("max_stores, primary_store_id").eq("id", true).maybeSingle();
  const input = await gatherPlanInput(supabase, plan.macro_modes ?? {}, plan.wishes ?? "");
  const { warnings, status } = await resolveComputeAndSave(supabase, planId, meals, locked, input, {
    mealGrid: plan.meal_grid as WeekMealGrid,
    budget: plan.budget,
    budgetType: plan.budget_type,
    maxStores: settings?.max_stores ?? 2,
    primaryStoreId: settings?.primary_store_id ?? null,
  });

  const nextRound = round + 1;
  await supabase
    .from("week_plans")
    .update({
      totals: {
        cost: status.totalCost,
        budgetStatus: status.budgetStatus,
        violations: status.violations,
        warnings,
        round: nextRound,
        dayPersonStatus: status.dayPersonStatus,
      },
    })
    .eq("id", planId);

  return {
    planId,
    violations: status.violations,
    warnings,
    totalCost: status.totalCost,
    budgetStatus: status.budgetStatus,
    round: nextRound,
    done: status.violations.length === 0 || nextRound >= 2,
  };
}
