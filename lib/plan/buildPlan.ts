import type { SupabaseClient } from "@supabase/supabase-js";
import { gatherPlanInput, formatOffersCompact, formatPantryCompact } from "./gatherInput";
import { generateMealPlan, type PlannerMeal } from "@/lib/ai/planGenerate";
import { matchIngredientToFood } from "@/lib/foods/matchIngredient";
import { estimatePrice } from "@/lib/ai/priceEstimate";
import { packsNeeded, packCost } from "@/lib/calc/unitPrice";
import { enumerateStoreCombos, cheapestCombo, type ItemOption } from "@/lib/calc/storeCombos";
import { computePlanStatus } from "./computeStatus";
import type { ResolvedIngredient } from "./resolveIngredients";
import type { MacroMode, WeekMealGrid, MealType } from "./types";

export type BuildPlanParams = {
  weekStart: string;
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

/**
 * Genereringen er delt op i mange små serverkald, fordi selv ét Claude-kald
 * for en hel uges retter ad gangen viste sig for langsomt til at nå inden
 * for Vercels 60s-grænse for serverfunktioner (bekræftet i Vercels egne
 * logs: "Task timed out after 60 seconds"). Derfor bedes Claude om én ret
 * ad gangen i stedet. Tilstanden undervejs gemmes i week_plans.totals.draft.
 */
type Slot = { date: string; meal_type: MealType };

type Draft = {
  meals: PlannerMeal[];
  pendingSlots: Slot[];
  violations: string[]; // kontekst for en evt. tilretningsrunde
  pendingFoodNames: string[];
  foodIdByName: Record<string, string | null>;
  pendingPriceNames: string[];
  priceByName: Record<string, number>;
  phase: "meals" | "foods" | "prices" | "ready";
  round: number;
  /** Løbende, hurtigt (ikke-AI) prisestimat for allerede genererede retter denne kørsel. */
  spentSoFar: number;
};

/**
 * Hurtigt, ikke-AI-baseret prisestimat for én ret, kun til at holde styr på
 * et løbende forbrug, mens resten af ugen genereres - den rigtige pris
 * (med tilbud, prisliste og AI-estimater) regnes først ud ved finalize.
 * "offer"/"buy" slås op mod reelle data, hvor det er hurtigt; ellers bruges
 * et fast gæt, så løbet ikke bliver blokeret af nye AI-kald.
 */
async function quickEstimateMealCost(supabase: SupabaseClient, meal: PlannerMeal): Promise<number> {
  const FALLBACK_PER_ITEM = 18;
  let total = 0;

  const offerIds = meal.ingredients.filter((i) => i.source === "offer" && i.offer_id).map((i) => i.offer_id!);
  const offerPriceById = new Map<string, number>();
  if (offerIds.length > 0) {
    const { data } = await supabase.from("offers").select("id, total_price").in("id", offerIds);
    for (const o of data ?? []) offerPriceById.set(o.id, o.total_price ?? FALLBACK_PER_ITEM);
  }

  const buyNames = Array.from(new Set(meal.ingredients.filter((i) => i.source === "buy").map((i) => i.name.toLowerCase())));
  const priceByName = new Map<string, number>();
  if (buyNames.length > 0) {
    const { data } = await supabase.from("price_list").select("name, price").in("name", buyNames);
    for (const p of data ?? []) priceByName.set(p.name.toLowerCase(), p.price);
  }

  for (const ing of meal.ingredients) {
    if (ing.source === "offer" && ing.offer_id) {
      total += offerPriceById.get(ing.offer_id) ?? FALLBACK_PER_ITEM;
    } else if (ing.source === "buy") {
      total += priceByName.get(ing.name.toLowerCase()) ?? FALLBACK_PER_ITEM;
    }
  }
  return total;
}

const BATCH_SIZE = 5;

function slotsToFill(mealGrid: WeekMealGrid, locked: LockedMeal[]): Slot[] {
  const lockedKeys = new Set(locked.map((l) => `${l.date}|${l.meal_type}`));
  const slots: Slot[] = [];
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
  slot: Slot,
  locked: LockedMeal[],
  violations: string[],
  alreadyPlanned: PlannerMeal[],
  budgetPerMeal: number | null,
): string {
  const peopleLines = input.people
    .map((p) => `${p.id} | ${p.name} | mål: ${p.kcal} kcal, ${p.protein_g} g protein, ${p.carbs_g} g kulhydrat, ${p.fat_g} g fedt | tilstand: ${p.macroMode}`)
    .join("\n");

  const lockedLines = locked.map((l) => `${l.date} ${l.meal_type}: ${l.recipes?.title ?? "?"} (LÅST, foreslå ikke denne)`).join("\n");
  const budgetIsIssue = violations.some((v) => v.includes("Budget overskredet"));
  const violationsBlock =
    violations.length > 0
      ? `\n\nDEN NUVÆRENDE PLAN HOLDER IKKE HELT - KONKRETE BRUD, DER HELST SKAL RETTES, HVIS DENNE RET BERØRER DEM:\n${violations.join("\n")}${budgetIsIssue ? "\nDa budgettet er sprængt, skal DENNE ret være tydeligt billigere end gennemsnittet - brug tilbud og billige basisvarer, undgå dyre proteiner som oksefilet/laks/rejer, medmindre de er på tilbud." : ""}`
      : "";

  const plannedLines = [...locked.map((l) => l.recipes?.title ?? "?"), ...alreadyPlanned.map((m) => m.title)];
  const plannedBlock =
    plannedLines.length > 0
      ? `\n\nALLEREDE PLANLAGT DENNE UGE (brug ikke samme hovedråvare/protein igen her, medmindre det er en helt anden type ret):\n${plannedLines.join(", ")}`
      : "";

  const budgetBlock =
    budgetPerMeal != null
      ? `\n\nBUDGET (HÅRDT LOFT - vigtigere end variation eller smag): denne ene ret må højst koste ${Math.round(budgetPerMeal)} kr. i alt for tilbuds- og købsvarer tilsammen (kun "pantry" og "staple" er gratis). Det beløb er allerede justeret ned, hvis tidligere retter denne uge har brugt mere end deres andel, så hold dig under det. Vælg billige ingredienser (kylling, æg, bønner, pasta, ris, sæsongrønt, kartofler) og brug tilbud aktivt - undgå oksefilet, laks, rejer og andre dyre varer, medmindre de er markeret SKAL_MED. Brug hellere færre/billigere ingredienser end at overskride beløbet.`
      : "";

  return `MÅLTID, DER SKAL FORESLÅS (kun denne ene):\n${slot.date} ${slot.meal_type}\n\nLÅSTE MÅLTIDER (til kontekst, må ikke ændres):\n${lockedLines || "(ingen)"}${plannedBlock}${budgetBlock}\n\nPERSONER:\n${peopleLines}\n\nMaks. tilberedningstid på hverdage: ${input.settings.maxPrepWeekdayMin} minutter.\nTing vi ikke spiser: ${input.settings.dislikes.join(", ") || "ingen"}.\nAllergier: ${input.settings.allergies.join(", ") || "ingen"}.\n\nTILBUD (id | navn | butik | pakke | pris | kilopris | kcal/100g | protein/100g | pris/100g protein | evt. SKAL_MED):\n${formatOffersCompact(input.offers)}\n\n${formatPantryCompact(input)}\n\nVIGTIGT OM BEHOLDNING: kilde "pantry" må kun bruges, hvis varen og mængden reelt findes i beholdningslisten ovenfor, og kun i ÉT måltid denne uge - er den allerede brugt (se "allerede planlagt"), eller er mængden større end det, der står på lager, så brug kilde "buy" i stedet. Basisvarer ("staple") må gerne genbruges frit.\n\nRetter fra de sidste tre uger (undgå gentagelse): ${input.recentRecipeTitles.join(", ") || "ingen"}.\nFavoritretter (gerne igen): ${input.favoriteRecipeTitles.join(", ") || "ingen"}.\n\nUgens ønsker: ${input.wishes || "ingen"}.${violationsBlock}`;
}

async function getLockedMeals(supabase: SupabaseClient, planId: string): Promise<LockedMeal[]> {
  const { data } = await supabase
    .from("planned_meals")
    .select("id, date, meal_type, recipe_id, servings, recipes(title, description, base_servings, prep_minutes, steps)")
    .eq("plan_id", planId)
    .eq("locked", true);
  return (data ?? []) as unknown as LockedMeal[];
}

/**
 * Claude ved ikke, hvor meget af en beholdningsvare de andre måltider
 * denne uge allerede har "brugt", så den kan nemt påstå, at den samme
 * vare kommer gratis fra beholdningen i flere retter. Her tjekkes hvert
 * "pantry"-sourcet ingrediens mod den faktiske beholdning (i den
 * rækkefølge, retterne er genereret i) - ugyldige eller for store krav
 * bliver omdøbt til "buy", så de får en rigtig pris.
 */
async function capPantryUsage(supabase: SupabaseClient, meals: PlannerMeal[]): Promise<void> {
  const { data: pantryRows } = await supabase.from("pantry_items").select("id, quantity").eq("is_staple", false);
  const remainingById = new Map((pantryRows ?? []).map((p) => [p.id, p.quantity]));
  const usedWithoutQuantity = new Set<string>();

  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      if (ing.source !== "pantry") continue;

      const pantryId = ing.pantry_item_id;
      if (!pantryId || !remainingById.has(pantryId)) {
        ing.source = "buy";
        ing.pantry_item_id = null;
        continue;
      }

      const remaining = remainingById.get(pantryId);
      if (remaining == null) {
        // Ukendt mængde ("nok til én ret") - tillad kun ét krav pr. vare.
        if (usedWithoutQuantity.has(pantryId)) {
          ing.source = "buy";
          ing.pantry_item_id = null;
        } else {
          usedWithoutQuantity.add(pantryId);
        }
        continue;
      }

      if (remaining >= ing.grams_raw) {
        remainingById.set(pantryId, remaining - ing.grams_raw);
      } else {
        ing.source = "buy";
        ing.pantry_item_id = null;
      }
    }
  }
}

async function pendingPriceNamesFor(supabase: SupabaseClient, meals: PlannerMeal[]): Promise<string[]> {
  const buyNames = Array.from(
    new Set(meals.flatMap((m) => m.ingredients.filter((i) => i.source === "buy").map((i) => i.name.toLowerCase()))),
  );
  if (buyNames.length === 0) return [];
  const { data: priceListRows } = await supabase.from("price_list").select("name").in("name", buyNames);
  const covered = new Set((priceListRows ?? []).map((p) => p.name.toLowerCase()));
  return buyNames.filter((n) => !covered.has(n));
}

async function saveDraft(supabase: SupabaseClient, planId: string, draft: Draft) {
  const { data: plan } = await supabase.from("week_plans").select("totals").eq("id", planId).single();
  await supabase
    .from("week_plans")
    .update({ totals: { ...(plan?.totals ?? {}), draft } })
    .eq("id", planId);
}

async function loadDraft(supabase: SupabaseClient, planId: string): Promise<Draft | null> {
  const { data: plan } = await supabase.from("week_plans").select("totals").eq("id", planId).single();
  return (plan?.totals as { draft?: Draft } | null)?.draft ?? null;
}

function remainingCount(draft: Draft): number {
  return draft.pendingSlots.length + draft.pendingFoodNames.length + draft.pendingPriceNames.length;
}

function freshDraft(pendingSlots: Slot[], violations: string[], round: number): Draft {
  return {
    meals: [],
    pendingSlots,
    violations,
    pendingFoodNames: [],
    foodIdByName: {},
    pendingPriceNames: [],
    priceByName: {},
    phase: pendingSlots.length > 0 ? "meals" : "ready",
    round,
    spentSoFar: 0,
  };
}

/** Trin 1: gem rammerne og find ud af, hvilke måltider der mangler. Intet AI-kald endnu. */
export async function startPlanGeneration(supabase: SupabaseClient, params: BuildPlanParams) {
  const { data: existingPlan } = await supabase.from("week_plans").select("id").eq("week_start", params.weekStart).maybeSingle();

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
  const draft = freshDraft(slots, [], 0);
  await saveDraft(supabase, planId, draft);

  return { planId, remaining: remainingCount(draft), phase: draft.phase };
}

/** Trin 2 (kaldes gentagne gange): foreslår én ret, eller matcher/prissætter nogle få ingredienser. */
export async function resolveNextPlanBatch(supabase: SupabaseClient, planId: string) {
  const draft = await loadDraft(supabase, planId);
  if (!draft) throw new Error("Ingen plan under behandling.");

  if (draft.phase === "meals") {
    const slot = draft.pendingSlots[0];
    const locked = await getLockedMeals(supabase, planId);
    const { data: plan } = await supabase.from("week_plans").select("macro_modes, wishes, budget").eq("id", planId).single();
    const input = await gatherPlanInput(supabase, plan?.macro_modes ?? {}, plan?.wishes ?? "");

    // Dynamisk budget pr. ret: resterende beløb delt med resterende antal
    // retter - IKKE et statisk gennemsnit. Falder, hvis tidligere retter
    // denne kørsel allerede har brugt mere end deres andel, så presset for
    // at spare op stiger i stedet for at blive ignoreret resten af ugen.
    const remainingSlots = draft.pendingSlots.length;
    const remainingBudget = (plan?.budget ?? 0) - draft.spentSoFar;
    const budgetPerMeal = plan?.budget && remainingSlots > 0 ? Math.max(10, remainingBudget / remainingSlots) : null;

    const userMessage = buildUserMessage(input, slot, locked, draft.violations, draft.meals, budgetPerMeal);
    const result = await generateMealPlan(supabase, userMessage);
    if (result.meals.length > 0) {
      const newMeal = { ...result.meals[0], date: slot.date, meal_type: slot.meal_type };
      draft.meals.push(newMeal);
      draft.spentSoFar += await quickEstimateMealCost(supabase, newMeal);
    }
    draft.pendingSlots = draft.pendingSlots.slice(1);

    if (draft.pendingSlots.length === 0) {
      await capPantryUsage(supabase, draft.meals);
      draft.pendingFoodNames = Array.from(new Set(draft.meals.flatMap((m) => m.ingredients.map((i) => i.name.toLowerCase()))));
      draft.pendingPriceNames = await pendingPriceNamesFor(supabase, draft.meals);
      draft.phase = draft.pendingFoodNames.length > 0 ? "foods" : draft.pendingPriceNames.length > 0 ? "prices" : "ready";
    }
  } else if (draft.phase === "foods") {
    const batch = draft.pendingFoodNames.slice(0, BATCH_SIZE);
    await Promise.all(
      batch.map(async (name) => {
        try {
          draft.foodIdByName[name] = await matchIngredientToFood(supabase, name);
        } catch {
          draft.foodIdByName[name] = null;
        }
      }),
    );
    draft.pendingFoodNames = draft.pendingFoodNames.slice(BATCH_SIZE);
    if (draft.pendingFoodNames.length === 0) {
      draft.phase = draft.pendingPriceNames.length > 0 ? "prices" : "ready";
    }
  } else if (draft.phase === "prices") {
    const batch = draft.pendingPriceNames.slice(0, BATCH_SIZE);
    await Promise.all(
      batch.map(async (name) => {
        try {
          const price = await estimatePrice(supabase, name, null, null);
          draft.priceByName[name] = price;
          await supabase.from("price_list").insert({ name, price, is_estimate: true });
        } catch {
          draft.priceByName[name] = 0;
        }
      }),
    );
    draft.pendingPriceNames = draft.pendingPriceNames.slice(BATCH_SIZE);
    if (draft.pendingPriceNames.length === 0) draft.phase = "ready";
  }

  await saveDraft(supabase, planId, draft);
  return { remaining: remainingCount(draft), phase: draft.phase };
}

/** Trin 3: ren beregning (ingen AI) - butiksvalg, status, gem. */
export async function finalizePlanGeneration(supabase: SupabaseClient, planId: string) {
  const { data: plan } = await supabase.from("week_plans").select("*").eq("id", planId).single();
  if (!plan) throw new Error("Planen findes ikke.");
  const draft = (plan.totals as { draft?: Draft } | null)?.draft;
  if (!draft) throw new Error("Ingen forberedt plan at færdiggøre.");

  const warnings: string[] = [];
  const meals = draft.meals;
  const locked = await getLockedMeals(supabase, planId);

  // Slår op direkte i ingredient_food_map i stedet for kun at stole på
  // draft.foodIdByName - mere robust, og dækker også evt. ingredienser,
  // der blev matchet før denne plan (fx via Beholdning).
  const allIngredientNames = Array.from(new Set(meals.flatMap((m) => m.ingredients.map((i) => i.name.toLowerCase()))));
  const { data: foodMapRows } =
    allIngredientNames.length > 0
      ? await supabase.from("ingredient_food_map").select("ingredient_name, food_id").in("ingredient_name", allIngredientNames)
      : { data: [] };
  const foodIdByName = new Map<string, string | null>(
    (foodMapRows ?? []).map((r) => [r.ingredient_name, r.food_id]),
  );
  for (const [name, id] of Object.entries(draft.foodIdByName)) {
    if (!foodIdByName.has(name)) foodIdByName.set(name, id);
  }

  const { data: settings } = await supabase.from("settings").select("max_stores, primary_store_id").eq("id", true).maybeSingle();
  const maxStores = settings?.max_stores ?? 2;
  const primaryStoreId = settings?.primary_store_id ?? null;

  const { data: storesData } = await supabase.from("stores").select("id").eq("enabled", true);
  const enabledStoreIds = (storesData ?? []).map((s) => s.id);

  const offerIds = Array.from(
    new Set(meals.flatMap((m) => m.ingredients.filter((i) => i.source === "offer" && i.offer_id).map((i) => i.offer_id!))),
  );
  const { data: offerRows } =
    offerIds.length > 0
      ? await supabase.from("offers").select("id, store_id, pack_count, pack_size, pack_unit, total_price").in("id", offerIds)
      : { data: [] };
  const offersById = new Map((offerRows ?? []).map((o) => [o.id, o]));

  const buyNames = Array.from(new Set(meals.flatMap((m) => m.ingredients.filter((i) => i.source === "buy").map((i) => i.name.toLowerCase()))));
  const { data: priceListRows } =
    buyNames.length > 0 ? await supabase.from("price_list").select("name, price, pack_size, pack_unit, store_id").in("name", buyNames) : { data: [] };
  const priceListByName = new Map((priceListRows ?? []).map((p) => [p.name.toLowerCase(), p]));

  type Group = { kind: "offer"; offerId: string } | { kind: "buy"; name: string };
  const groupKey = (g: Group) => (g.kind === "offer" ? "offer:" + g.offerId : "buy:" + g.name);
  const gramsByGroup = new Map<string, number>();
  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      if (ing.source === "offer" && ing.offer_id && offersById.has(ing.offer_id)) {
        const key = groupKey({ kind: "offer", offerId: ing.offer_id });
        gramsByGroup.set(key, (gramsByGroup.get(key) ?? 0) + ing.grams_raw);
      } else if (ing.source === "buy") {
        const key = groupKey({ kind: "buy", name: ing.name.toLowerCase() });
        gramsByGroup.set(key, (gramsByGroup.get(key) ?? 0) + ing.grams_raw);
      }
    }
  }

  const itemOptionByGroup = new Map<string, ItemOption>();
  const packInfoByGroup = new Map<string, { costPerGroup: number }>();

  for (const [key, grams] of gramsByGroup) {
    if (key.startsWith("offer:")) {
      const offer = offersById.get(key.slice(6));
      if (!offer || !offer.pack_count || !offer.pack_size || !offer.pack_unit || !offer.total_price) {
        warnings.push(`Tilbud ${key.slice(6)} mangler pakkeinfo og kunne ikke prissættes.`);
        continue;
      }
      const packs = packsNeeded(grams, offer.pack_count * offer.pack_size);
      const cost = packCost(packs, offer.total_price);
      itemOptionByGroup.set(key, { sources: [{ storeId: offer.store_id, packs, packPrice: offer.total_price, isEstimate: false }] });
      packInfoByGroup.set(key, { costPerGroup: cost });
      continue;
    }

    const name = key.slice(4);
    const priceListEntry = priceListByName.get(name);
    if (priceListEntry) {
      const packs = packsNeeded(grams, priceListEntry.pack_size ?? 500);
      const cost = packCost(packs, priceListEntry.price);
      itemOptionByGroup.set(key, {
        sources: [{ storeId: priceListEntry.store_id ?? primaryStoreId, packs, packPrice: priceListEntry.price, isEstimate: priceListEntry.price === 0 }],
      });
      packInfoByGroup.set(key, { costPerGroup: cost });
      continue;
    }

    const estimatedPrice = draft.priceByName[name];
    if (estimatedPrice != null) {
      itemOptionByGroup.set(key, { sources: [{ storeId: primaryStoreId, packs: 1, packPrice: estimatedPrice, isEstimate: true }] });
      packInfoByGroup.set(key, { costPerGroup: estimatedPrice });
    }
  }

  const combos = enumerateStoreCombos(enabledStoreIds, maxStores);
  let best = cheapestCombo(combos, Array.from(itemOptionByGroup.values()));
  if (!best && itemOptionByGroup.size > 0) {
    warnings.push(`Tilbud og indkøb spreder sig over flere end ${maxStores} butik(ker) - brugte alle aktive butikker.`);
    best = cheapestCombo(enumerateStoreCombos(enabledStoreIds, enabledStoreIds.length), Array.from(itemOptionByGroup.values()));
  }

  const resolved: ResolvedIngredient[] = [];
  meals.forEach((meal, mealIndex) => {
    for (const ing of meal.ingredients) {
      const foodId = foodIdByName.get(ing.name.toLowerCase()) ?? null;
      let costDkk = 0;
      if (ing.source === "offer" && ing.offer_id && offersById.has(ing.offer_id)) {
        const key = groupKey({ kind: "offer", offerId: ing.offer_id });
        const info = packInfoByGroup.get(key);
        const totalGrams = gramsByGroup.get(key) ?? ing.grams_raw;
        if (info) costDkk = (info.costPerGroup * ing.grams_raw) / totalGrams;
      } else if (ing.source === "buy") {
        const key = groupKey({ kind: "buy", name: ing.name.toLowerCase() });
        const info = packInfoByGroup.get(key);
        const totalGrams = gramsByGroup.get(key) ?? ing.grams_raw;
        if (info) costDkk = (info.costPerGroup * ing.grams_raw) / totalGrams;
      }
      resolved.push({
        mealIndex,
        name: ing.name,
        gramsRaw: ing.grams_raw,
        source: ing.source,
        offerId: ing.offer_id ?? null,
        pantryItemId: ing.pantry_item_id ?? null,
        foodId,
        costDkk,
      });
    }
  });

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

  const input = await gatherPlanInput(supabase, plan.macro_modes ?? {}, plan.wishes ?? "");
  const status = await computePlanStatus(
    supabase,
    [...meals, ...lockedAsMeals],
    resolved,
    input.people,
    plan.meal_grid as WeekMealGrid,
    input.settings.mealShares,
    plan.budget,
    plan.budget_type,
  );

  const statusByDate = new Map<string, "grøn" | "gul" | "rød">();
  const order = { grøn: 0, gul: 1, rød: 2 } as const;
  for (const dp of status.dayPersonStatus) {
    const current = statusByDate.get(dp.date);
    if (!current || order[dp.evaluation.overall] > order[current]) statusByDate.set(dp.date, dp.evaluation.overall);
  }

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
        portion_factors: status.mealComputations[i]?.portionFactors ?? {},
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

  await supabase
    .from("week_plans")
    .update({
      totals: {
        cost: status.totalCost,
        budgetStatus: status.budgetStatus,
        violations: status.violations,
        warnings,
        round: draft.round,
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
    round: draft.round,
  };
}

/** Starter en tilretningsrunde: genererer igen, ét måltid ad gangen, med de konkrete brud som kontekst. */
export async function startPlanFix(supabase: SupabaseClient, planId: string) {
  const { data: plan } = await supabase.from("week_plans").select("totals, meal_grid").eq("id", planId).single();
  if (!plan) throw new Error("Planen findes ikke.");

  const round = (plan.totals as { round?: number })?.round ?? 0;
  const previousViolations = (plan.totals as { violations?: string[] })?.violations ?? [];
  if (round >= 2 || previousViolations.length === 0) {
    return { planId, remaining: 0, phase: "ready" as const, done: true };
  }

  const locked = await getLockedMeals(supabase, planId);
  const slots = slotsToFill(plan.meal_grid as WeekMealGrid, locked);
  const draft = freshDraft(slots, previousViolations, round + 1);
  await saveDraft(supabase, planId, draft);

  return { planId, remaining: remainingCount(draft), phase: draft.phase, done: slots.length === 0 };
}
