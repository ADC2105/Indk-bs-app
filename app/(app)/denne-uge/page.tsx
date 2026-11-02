import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/plan/weekStart";
import MealCard from "@/components/MealCard";

export const maxDuration = 60;

type Totals = {
  cost: number;
  budgetStatus: "grøn" | "gul" | "rød";
  violations: string[];
  round: number;
};

const STATUS_COLOR: Record<string, string> = {
  grøn: "bg-green-100 text-green-700 border-green-300",
  gul: "bg-amber-100 text-amber-700 border-amber-300",
  rød: "bg-red-100 text-red-700 border-red-300",
};

export default async function DenneUgePage() {
  const supabase = await createClient();
  const weekStart = currentWeekStart();

  const { data: plan } = await supabase.from("week_plans").select("*").eq("week_start", weekStart).maybeSingle();

  if (!plan) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Denne uge</h1>
        <p className="text-sm text-gray-500">Der er ikke lavet en plan for denne uge endnu.</p>
        <Link href="/planlaeg-uge" className="w-fit rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white">
          Planlæg ugen
        </Link>
      </div>
    );
  }

  const { data: meals } = await supabase
    .from("planned_meals")
    .select("id, date, meal_type, locked, servings, computed_status, recipes(id, title, description, base_servings, prep_minutes, steps, recipe_ingredients(name, grams_raw))")
    .eq("plan_id", plan.id)
    .order("date");

  const totals = (plan.totals ?? {}) as Partial<Totals>;
  const budget = plan.budget as number;
  const budgetPct = budget > 0 ? Math.min(100, Math.round(((totals.cost ?? 0) / budget) * 100)) : 0;

  const byDate = new Map<string, typeof meals>();
  for (const meal of meals ?? []) {
    const list = byDate.get(meal.date) ?? [];
    list.push(meal);
    byDate.set(meal.date, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Denne uge</h1>
        <Link href="/planlaeg-uge" className="text-sm text-gray-500 underline">
          Planlæg igen
        </Link>
      </div>

      <div className={`rounded-lg border p-3 ${STATUS_COLOR[totals.budgetStatus ?? "grøn"]}`}>
        <p className="text-sm font-medium">
          {Math.round(totals.cost ?? 0)} kr. af {budget} kr. ({budgetPct}%)
        </p>
        <div className="mt-1 h-2 rounded-full bg-white/60">
          <div className="h-2 rounded-full bg-current" style={{ width: `${budgetPct}%` }} />
        </div>
      </div>

      {totals.violations && totals.violations.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Planen holder ikke helt endnu:</p>
          <ul className="mt-1 list-disc pl-5">
            {totals.violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
          <p className="mt-1">Prøv at hæve budgettet, skifte makrotilstand, eller lås de retter der virker og generér igen.</p>
        </div>
      )}

      {Array.from(byDate.entries()).map(([date, dayMeals]) => (
        <section key={date}>
          <h2 className="mb-1 text-sm font-semibold text-gray-700">{date}</h2>
          <div className="flex flex-col gap-2">
            {(dayMeals ?? []).map((meal) => (
              <MealCard
                key={meal.id}
                id={meal.id}
                mealType={meal.meal_type}
                locked={meal.locked}
                servings={meal.servings}
                status={meal.computed_status}
                recipe={meal.recipes as unknown as {
                  title: string;
                  description: string | null;
                  base_servings: number;
                  prep_minutes: number | null;
                  steps: string[];
                  recipe_ingredients: { name: string; grams_raw: number }[];
                } | null}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
