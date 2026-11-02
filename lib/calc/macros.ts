export type Nutrition100g = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
};

export type Nutrition = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
};

/** Regner næring ud for en given mængde (gram) ud fra værdier pr. 100 g. */
export function scaleNutrition(per100g: Nutrition100g, grams: number): Nutrition {
  const factor = grams / 100;
  return {
    kcal: per100g.kcal * factor,
    protein: per100g.protein * factor,
    carbs: per100g.carbs * factor,
    fat: per100g.fat * factor,
    fiber: per100g.fiber != null ? per100g.fiber * factor : null,
  };
}

export function sumNutrition(items: Nutrition[]): Nutrition {
  return items.reduce(
    (sum, item) => ({
      kcal: sum.kcal + item.kcal,
      protein: sum.protein + item.protein,
      carbs: sum.carbs + item.carbs,
      fat: sum.fat + item.fat,
      fiber: item.fiber != null ? (sum.fiber ?? 0) + item.fiber : sum.fiber,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: null as number | null },
  );
}

/**
 * Portionsfaktor: personens mål for måltidet delt med rettens kalorier pr.
 * grundportion, begrænset til 0,5-2,0 (SPEC.md "Portioner pr. person").
 */
export function portionFactor(personMealTargetKcal: number, baseServingKcal: number): number {
  if (!(baseServingKcal > 0)) return 1;
  const raw = personMealTargetKcal / baseServingKcal;
  return Math.min(2.0, Math.max(0.5, raw));
}

export type MealType = "morgenmad" | "frokost" | "aftensmad" | "snack";
export type MealShares = Record<MealType, number>;

/**
 * Dagens mål for en person, givet hvilke måltidstyper der er planlagt den
 * dag. Målet er summen af andelene for de planlagte måltider gange
 * dagsmålet (SPEC.md "Måltidsandele").
 */
export function dailyTargetForPlannedMeals(
  dailyGoal: number,
  shares: MealShares,
  plannedMealTypes: MealType[],
): number {
  const share = plannedMealTypes.reduce((sum, type) => sum + (shares[type] ?? 0), 0);
  return dailyGoal * share;
}

export type MacroStatus = "grøn" | "gul" | "rød";

/**
 * Status for én værdi mod et mål inden for en tolerance (i procent, fx 0.1
 * for ±10 %). Grøn inden for tolerancen, gul op til dobbelt tolerance, rød
 * længere væk (SPEC.md "Makrotilstande").
 */
export function macroStatus(actual: number, target: number, tolerance: number): MacroStatus {
  if (!(target > 0)) return "grøn";
  const deviation = Math.abs(actual - target) / target;
  if (deviation <= tolerance) return "grøn";
  if (deviation <= tolerance * 2) return "gul";
  return "rød";
}

/**
 * Status for et minimumskrav (fx protein må ikke ligge under målet).
 * Grøn hvis opfyldt, gul hvis inden for tolerancen under målet, ellers rød.
 */
export function minimumStatus(actual: number, minimum: number, tolerance: number): MacroStatus {
  if (actual >= minimum) return "grøn";
  const deviation = (minimum - actual) / minimum;
  if (deviation <= tolerance) return "gul";
  return "rød";
}

/** Den samlede status er den dårligste af de enkelte statusser. */
export function worstStatus(statuses: MacroStatus[]): MacroStatus {
  if (statuses.includes("rød")) return "rød";
  if (statuses.includes("gul")) return "gul";
  return "grøn";
}
