"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { suggestSwapOptions, type PlannerMeal } from "@/lib/ai/planGenerate";
import { resolveIngredients } from "@/lib/plan/resolveIngredients";

export async function toggleLock(plannedMealId: string, locked: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("planned_meals").update({ locked }).eq("id", plannedMealId);
  if (error) return { error: "Kunne ikke opdatere låsen: " + error.message };
  revalidatePath("/denne-uge");
  return { ok: true };
}

export async function changeServings(plannedMealId: string, servings: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("planned_meals").update({ servings }).eq("id", plannedMealId);
  if (error) return { error: "Kunne ikke ændre portioner: " + error.message };
  revalidatePath("/denne-uge");
  return { ok: true };
}

export async function markCooked(plannedMealId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("planned_meals").update({ cooked_at: new Date().toISOString() }).eq("id", plannedMealId);
  if (error) return { error: "Kunne ikke markere som lavet: " + error.message };
  revalidatePath("/denne-uge");
  return { ok: true };
}

export type SwapOption = {
  meal: PlannerMeal;
  costDkk: number;
  kcal: number;
  protein: number;
  costDelta: number;
  kcalDelta: number;
  proteinDelta: number;
};

async function sumMealNutritionAndCost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  meals: PlannerMeal[],
  maxStores: number,
  primaryStoreId: string | null,
) {
  const { resolved } = await resolveIngredients(supabase, meals, maxStores, [], primaryStoreId);
  const foodIds = Array.from(new Set(resolved.map((r) => r.foodId).filter((id): id is string => !!id)));
  const { data: foods } = foodIds.length > 0 ? await supabase.from("foods").select("id, kcal, protein").in("id", foodIds) : { data: [] };
  const foodById = new Map((foods ?? []).map((f) => [f.id, f]));

  return meals.map((_, mealIndex) => {
    const items = resolved.filter((r) => r.mealIndex === mealIndex);
    let kcal = 0;
    let protein = 0;
    let costDkk = 0;
    for (const item of items) {
      const food = item.foodId ? foodById.get(item.foodId) : null;
      if (food) {
        kcal += (food.kcal * item.gramsRaw) / 100;
        protein += (food.protein * item.gramsRaw) / 100;
      }
      costDkk += item.costDkk;
    }
    return { kcal, protein, costDkk };
  });
}

export async function requestSwapOptions(plannedMealId: string) {
  const supabase = await createClient();

  const { data: meal } = await supabase
    .from("planned_meals")
    .select("id, date, meal_type, recipes(title, description)")
    .eq("id", plannedMealId)
    .single();
  if (!meal) return { error: "Måltidet findes ikke." };

  const recipe = meal.recipes as unknown as { title: string; description: string | null } | null;
  const { data: settings } = await supabase.from("settings").select("max_stores, primary_store_id").eq("id", true).maybeSingle();
  const maxStores = settings?.max_stores ?? 2;
  const primaryStoreId = settings?.primary_store_id ?? null;

  const userMessage = `NUVÆRENDE RET: ${recipe?.title ?? ""} - ${recipe?.description ?? ""}\nDato: ${meal.date}\nMåltid: ${meal.meal_type}\n\nIngen tilbudsliste er givet denne gang - brug kilde "buy" eller "staple" for alle ingredienser.`;

  let result;
  try {
    result = await suggestSwapOptions(supabase, userMessage);
  } catch (err) {
    return { error: "Kunne ikke hente alternativer: " + (err instanceof Error ? err.message : "ukendt fejl") };
  }

  if (result.meals.length === 0) {
    return { error: "Fik ingen alternativer tilbage." };
  }

  const { data: currentIngredients } = await supabase
    .from("planned_ingredients")
    .select("grams_raw, food_id, cost_dkk")
    .eq("planned_meal_id", plannedMealId);
  const currentFoodIds = Array.from(new Set((currentIngredients ?? []).map((i) => i.food_id).filter((id): id is string => !!id)));
  const { data: currentFoods } =
    currentFoodIds.length > 0 ? await supabase.from("foods").select("id, kcal, protein").in("id", currentFoodIds) : { data: [] };
  const currentFoodById = new Map((currentFoods ?? []).map((f) => [f.id, f]));
  let currentKcal = 0;
  let currentProtein = 0;
  let currentCost = 0;
  for (const ing of currentIngredients ?? []) {
    const food = ing.food_id ? currentFoodById.get(ing.food_id) : null;
    if (food) {
      currentKcal += (food.kcal * ing.grams_raw) / 100;
      currentProtein += (food.protein * ing.grams_raw) / 100;
    }
    currentCost += ing.cost_dkk ?? 0;
  }

  const sums = await sumMealNutritionAndCost(supabase, result.meals, maxStores, primaryStoreId);

  const options: SwapOption[] = result.meals.map((m, i) => ({
    meal: m,
    costDkk: sums[i].costDkk,
    kcal: sums[i].kcal,
    protein: sums[i].protein,
    costDelta: sums[i].costDkk - currentCost,
    kcalDelta: sums[i].kcal - currentKcal,
    proteinDelta: sums[i].protein - currentProtein,
  }));

  return { options };
}

export async function confirmSwap(plannedMealId: string, meal: PlannerMeal) {
  const supabase = await createClient();

  const { data: settings } = await supabase.from("settings").select("max_stores, primary_store_id").eq("id", true).maybeSingle();
  const { resolved } = await resolveIngredients(
    supabase,
    [meal],
    settings?.max_stores ?? 2,
    [],
    settings?.primary_store_id ?? null,
  );

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
  if (recipeError || !recipe) return { error: "Kunne ikke gemme opskrift: " + recipeError?.message };

  await supabase.from("recipe_ingredients").insert(
    meal.ingredients.map((ing) => ({
      recipe_id: recipe.id,
      name: ing.name,
      grams_raw: ing.grams_raw,
      food_id: resolved.find((r) => r.name === ing.name)?.foodId ?? null,
    })),
  );

  const { error: updateError } = await supabase
    .from("planned_meals")
    .update({ recipe_id: recipe.id, servings: meal.base_servings, computed_status: null })
    .eq("id", plannedMealId);
  if (updateError) return { error: "Kunne ikke opdatere måltidet: " + updateError.message };

  await supabase.from("planned_ingredients").delete().eq("planned_meal_id", plannedMealId);
  if (resolved.length > 0) {
    await supabase.from("planned_ingredients").insert(
      resolved.map((ing) => ({
        planned_meal_id: plannedMealId,
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

  revalidatePath("/denne-uge");
  return { ok: true };
}
