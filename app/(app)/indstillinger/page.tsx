import { createClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/SettingsForm";
import PeopleEditor from "@/components/PeopleEditor";
import StoresToggleList from "@/components/StoresToggleList";

export default async function IndstillingerPage() {
  const supabase = await createClient();

  const [{ data: settings }, { data: people }, { data: stores }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("people").select("*").order("created_at"),
    supabase.from("stores").select("*").order("name"),
  ]);

  const defaultSettings = {
    lat: null,
    lng: null,
    radius_km: 10,
    shopping_day: 6,
    max_stores: 2,
    primary_store_id: null,
    default_budget: 700,
    budget_type: "mål" as const,
    default_meal_grid: {},
    meal_shares: { morgenmad: 0.2, frokost: 0.3, aftensmad: 0.35, snack: 0.15 },
    guest_portion_kcal: 700,
    max_prep_weekday_min: 30,
    dislikes: [] as string[],
    allergies: [] as string[],
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">Indstillinger</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Personer og makromål</h2>
        <PeopleEditor people={people ?? []} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Butikker</h2>
        <StoresToggleList stores={stores ?? []} />
      </section>

      <section>
        <SettingsForm settings={settings ?? defaultSettings} stores={(stores ?? []).filter((s) => s.enabled)} />
      </section>
    </div>
  );
}
