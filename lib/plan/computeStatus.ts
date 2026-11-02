import type { SupabaseClient } from "@supabase/supabase-js";
import { portionFactor, type Nutrition, type Nutrition100g } from "@/lib/calc/macros";
import { evaluateDayMacros, evaluateWeekBalanced, type MacroEvaluation } from "@/lib/calc/macroMode";
import type { PlannerMeal } from "@/lib/ai/planGenerate";
import type { ResolvedIngredient } from "./resolveIngredients";
import type { GatheredPerson } from "./gatherInput";
import type { WeekMealGrid } from "./types";

function scaleBy(n: Nutrition, factor: number): Nutrition {
  return {
    kcal: n.kcal * factor,
    protein: n.protein * factor,
    carbs: n.carbs * factor,
    fat: n.fat * factor,
    fiber: n.fiber != null ? n.fiber * factor : null,
  };
}

function addNutrition(a: Nutrition, b: Nutrition): Nutrition {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: a.fiber != null || b.fiber != null ? (a.fiber ?? 0) + (b.fiber ?? 0) : null,
  };
}

const ZERO: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: null };

export type MealComputation = {
  mealIndex: number;
  totalNutrition: Nutrition;
  perServingNutrition: Nutrition;
  portionFactors: Record<string, number>;
};

export type DayPersonStatus = {
  date: string;
  personId: string;
  actual: { kcal: number; protein: number; carbs: number; fat: number };
  target: { kcal: number; protein: number; carbs: number; fat: number };
  evaluation: MacroEvaluation;
};

export type PlanStatusResult = {
  mealComputations: MealComputation[];
  dayPersonStatus: DayPersonStatus[];
  totalCost: number;
  budgetStatus: "grøn" | "gul" | "rød";
  violations: string[];
};

export async function computePlanStatus(
  supabase: SupabaseClient,
  meals: PlannerMeal[],
  resolved: ResolvedIngredient[],
  people: GatheredPerson[],
  mealGrid: WeekMealGrid,
  mealShares: Record<string, number>,
  budget: number,
  budgetType: "loft" | "mål",
): Promise<PlanStatusResult> {
  const foodIds = Array.from(new Set(resolved.map((r) => r.foodId).filter((id): id is string => !!id)));
  const { data: foods } =
    foodIds.length > 0 ? await supabase.from("foods").select("id, kcal, protein, carbs, fat, fiber").in("id", foodIds) : { data: [] };
  const foodById = new Map((foods ?? []).map((f) => [f.id, f as Nutrition100g & { id: string }]));

  const mealComputations: MealComputation[] = meals.map((meal, mealIndex) => {
    const ingredients = resolved.filter((r) => r.mealIndex === mealIndex);
    let totalNutrition = ZERO;
    for (const ing of ingredients) {
      const food = ing.foodId ? foodById.get(ing.foodId) : undefined;
      if (!food) continue;
      const factor = ing.gramsRaw / 100;
      totalNutrition = addNutrition(totalNutrition, {
        kcal: food.kcal * factor,
        protein: food.protein * factor,
        carbs: food.carbs * factor,
        fat: food.fat * factor,
        fiber: food.fiber != null ? food.fiber * factor : null,
      });
    }
    const perServingNutrition = scaleBy(totalNutrition, 1 / Math.max(1, meal.base_servings));

    const cell = mealGrid[meal.date]?.[meal.meal_type];
    const portionFactors: Record<string, number> = {};
    for (const person of people) {
      const eats = !cell || cell.who === "begge" || cell.who === person.id;
      if (!eats) continue;
      const share = mealShares[meal.meal_type] ?? 0.25;
      const personMealTarget = person.kcal * share;
      portionFactors[person.id] = portionFactor(personMealTarget, perServingNutrition.kcal || 1);
    }

    return { mealIndex, totalNutrition, perServingNutrition, portionFactors };
  });

  // Dag/person-aggregering
  const byDayPerson = new Map<string, Nutrition>();
  const plannedMealTypesByDayPerson = new Map<string, Set<string>>();

  meals.forEach((meal, mealIndex) => {
    const computation = mealComputations[mealIndex];
    for (const [personId, factor] of Object.entries(computation.portionFactors)) {
      const key = `${meal.date}|${personId}`;
      const actual = scaleBy(computation.perServingNutrition, factor);
      byDayPerson.set(key, addNutrition(byDayPerson.get(key) ?? ZERO, actual));
      const set = plannedMealTypesByDayPerson.get(key) ?? new Set();
      set.add(meal.meal_type);
      plannedMealTypesByDayPerson.set(key, set);
    }
  });

  const dayPersonStatus: DayPersonStatus[] = [];
  const violations: string[] = [];
  const weekSumByPerson = new Map<string, { kcal: number; protein: number; days: number }>();

  for (const [key, actual] of byDayPerson) {
    const [date, personId] = key.split("|");
    const person = people.find((p) => p.id === personId);
    if (!person) continue;

    const plannedTypes = Array.from(plannedMealTypesByDayPerson.get(key) ?? []);
    const share = plannedTypes.reduce((sum, t) => sum + (mealShares[t] ?? 0), 0) || 1;
    const target = {
      kcal: person.kcal * share,
      protein: person.protein_g * share,
      carbs: person.carbs_g * share,
      fat: person.fat_g * share,
    };

    const evaluation = evaluateDayMacros(person.macroMode, actual, target);
    dayPersonStatus.push({ date, personId, actual, target, evaluation });

    if (evaluation.overall === "rød") {
      if (evaluation.protein !== "grøn") {
        const diff = Math.round(target.protein - actual.protein);
        if (diff > 0) violations.push(`${person.name} ${date}: mangler ca. ${diff} g protein.`);
      }
      if (evaluation.kcal !== "grøn") {
        violations.push(`${person.name} ${date}: kalorier er ${Math.round(actual.kcal)} mod mål ${Math.round(target.kcal)}.`);
      }
    }

    const sum = weekSumByPerson.get(personId) ?? { kcal: 0, protein: 0, days: 0 };
    sum.kcal += actual.kcal;
    sum.protein += actual.protein;
    sum.days += 1;
    weekSumByPerson.set(personId, sum);
  }

  for (const person of people) {
    if (person.macroMode !== "balanceret") continue;
    const sum = weekSumByPerson.get(person.id);
    if (!sum || sum.days === 0) continue;
    const avgActual = { kcal: sum.kcal / sum.days, protein: sum.protein / sum.days };
    const dailyShare = Object.values(mealShares).reduce((a, b) => a + b, 0) || 1;
    const dailyTarget = { kcal: person.kcal * dailyShare, protein: person.protein_g * dailyShare };
    const evaluation = evaluateWeekBalanced(avgActual, dailyTarget);
    if (evaluation.overall === "rød") {
      violations.push(
        `${person.name}: ugens gennemsnit er ${Math.round(avgActual.kcal)} kcal/dag mod mål ${Math.round(dailyTarget.kcal)}.`,
      );
    }
  }

  const totalCost = resolved.reduce((sum, r) => sum + r.costDkk, 0);
  let budgetStatus: "grøn" | "gul" | "rød" = "grøn";
  if (budgetType === "loft") {
    budgetStatus = totalCost <= budget ? "grøn" : "rød";
  } else {
    budgetStatus = totalCost <= budget ? "grøn" : totalCost <= budget * 1.1 ? "gul" : "rød";
  }
  if (budgetStatus === "rød") {
    violations.push(`Budget overskredet med ${Math.round(totalCost - budget)} kr.`);
  }

  return { mealComputations, dayPersonStatus, totalCost, budgetStatus, violations };
}
