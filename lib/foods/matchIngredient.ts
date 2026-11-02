import type { SupabaseClient } from "@supabase/supabase-js";
import { matchIngredientWithClaude } from "@/lib/ai/foodMatch";

/**
 * Matcher et ingrediensnavn til en fødevare (med næringsdata pr. 100 g).
 * Rækkefølge: cache (ingredient_food_map) -> pg_trgm-kandidater + Claude ->
 * enten en eksisterende Frida-fødevare eller et nyt estimat (markeret
 * source='estimate'). Hver ingrediens matches kun én gang (cachet).
 */
export async function matchIngredientToFood(
  supabase: SupabaseClient,
  ingredientName: string,
): Promise<string | null> {
  const name = ingredientName.trim().toLowerCase();
  if (!name) return null;

  const { data: cached } = await supabase
    .from("ingredient_food_map")
    .select("food_id")
    .eq("ingredient_name", name)
    .maybeSingle();

  if (cached) return cached.food_id;

  const { data: candidates, error: candidatesError } = await supabase.rpc("match_foods_by_trigram", {
    search: name,
    match_count: 10,
  });

  if (candidatesError) {
    throw new Error("Kunne ikke finde kandidater: " + candidatesError.message);
  }

  const result = await matchIngredientWithClaude(supabase, name, candidates ?? []);

  let foodId = result.food_id ?? null;
  let confidence = result.confidence ?? null;
  const estimate = result.estimate ?? null;

  if (!foodId && estimate) {
    const { data: inserted, error: insertError } = await supabase
      .from("foods")
      .insert({
        name_da: name,
        kcal: estimate.kcal,
        protein: estimate.protein,
        carbs: estimate.carbs,
        fat: estimate.fat,
        fiber: estimate.fiber ?? null,
        source: "estimate",
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error("Kunne ikke gemme estimat: " + insertError.message);
    }
    foodId = inserted.id;
    confidence = null;
  }

  await supabase.from("ingredient_food_map").insert({
    ingredient_name: name,
    food_id: foodId,
    confidence,
  });

  return foodId;
}
