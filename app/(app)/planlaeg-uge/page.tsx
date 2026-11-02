import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/plan/weekStart";
import PlanWizard from "@/components/PlanWizard";

export const maxDuration = 60;

export default async function PlanlaegUgePage() {
  const supabase = await createClient();

  const [{ data: settings }, { data: people }, { data: pantry }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("people").select("id, name"),
    supabase.from("pantry_items").select("id, name, quantity, unit").eq("use_soon", true).eq("is_staple", false),
  ]);

  const weekStart = currentWeekStart();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">Planlæg uge</h1>
      <p className="text-sm text-gray-500">Uge der starter {weekStart}</p>

      <PlanWizard
        weekStart={weekStart}
        defaultMealGrid={settings?.default_meal_grid ?? {}}
        defaultBudget={settings?.default_budget ?? 700}
        defaultBudgetType={settings?.budget_type ?? "mål"}
        maxStores={settings?.max_stores ?? 2}
        primaryStoreId={settings?.primary_store_id ?? null}
        people={people ?? []}
        useSoonItems={pantry ?? []}
      />
    </div>
  );
}
