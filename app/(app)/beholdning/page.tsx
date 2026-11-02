import { createClient } from "@/lib/supabase/server";
import PantryQuickAdd from "@/components/PantryQuickAdd";
import PantryItemRow from "@/components/PantryItemRow";
import StaplesChecklist from "@/components/StaplesChecklist";

type PantryItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  location: "køleskab" | "fryser" | "skab" | null;
  use_soon: boolean;
  is_staple: boolean;
};

const LOCATION_LABELS: Record<string, string> = {
  køleskab: "Køleskab",
  fryser: "Fryser",
  skab: "Skab",
};

export default async function BeholdningPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pantry_items")
    .select("id, name, quantity, unit, location, use_soon, is_staple")
    .order("name");

  const items = (data ?? []) as PantryItem[];
  const staples = items.filter((item) => item.is_staple);
  const byLocation: Record<string, PantryItem[]> = { køleskab: [], fryser: [], skab: [] };
  for (const item of items) {
    if (item.is_staple) continue;
    const key = item.location ?? "skab";
    (byLocation[key] ??= []).push(item);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">Beholdning</h1>

      <PantryQuickAdd />
      <StaplesChecklist />

      {error && (
        <p className="text-sm text-red-600">
          Kunne ikke hente beholdningen: {error.message}. Har du kørt databasemigrationen i Supabase?
        </p>
      )}

      {!error && items.length === 0 && (
        <p className="text-sm text-gray-500">Beholdningen er tom. Brug feltet ovenfor til at tilføje varer.</p>
      )}

      {(["køleskab", "fryser", "skab"] as const).map((location) => (
        <section key={location}>
          <h2 className="text-sm font-semibold text-gray-700">{LOCATION_LABELS[location]}</h2>
          {byLocation[location].length === 0 ? (
            <p className="text-sm text-gray-400">Ingen varer</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {byLocation[location].map((item) => (
                <PantryItemRow
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  quantity={item.quantity}
                  unit={item.unit}
                  useSoon={item.use_soon}
                  isStaple={item.is_staple}
                />
              ))}
            </ul>
          )}
        </section>
      ))}

      {staples.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700">Basisvarer</h2>
          <ul className="divide-y divide-gray-100">
            {staples.map((item) => (
              <PantryItemRow
                key={item.id}
                id={item.id}
                name={item.name}
                quantity={item.quantity}
                unit={item.unit}
                useSoon={item.use_soon}
                isStaple={item.is_staple}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
