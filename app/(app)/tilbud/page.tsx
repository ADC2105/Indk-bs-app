import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FetchOffersButton from "@/components/FetchOffersButton";
import OfferBrowser, { type OfferRow } from "@/components/OfferBrowser";

// Henter flere kataloger sekventielt med høflige pauser, så standard 10s er
// for lavt. 60s er Vercel Hobby-loftet for serverfunktioner/-actions.
export const maxDuration = 60;

export default async function TilbudPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("offers")
    .select(
      "id, heading, ingredient_name, category, price, quantity_text, pack_count, pack_size, pack_unit, total_price, needs_review, is_food, wanted, stores(name)",
    )
    .order("heading");

  const { count: pendingCount } = await supabase
    .from("offers")
    .select("id", { count: "exact", head: true })
    .is("ingredient_name", null);

  const offers: OfferRow[] = (data ?? []).map((o) => ({
    id: o.id,
    store_name: (o.stores as unknown as { name: string } | null)?.name ?? "Ukendt butik",
    heading: o.heading,
    ingredient_name: o.ingredient_name,
    category: o.category,
    price: o.price,
    quantity_text: o.quantity_text,
    pack_count: o.pack_count,
    pack_size: o.pack_size,
    pack_unit: o.pack_unit,
    total_price: o.total_price,
    needs_review: o.needs_review,
    is_food: o.is_food,
    wanted: o.wanted,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Tilbud</h1>
        <Link href="/tilbud/import" className="text-sm text-gray-500 underline">
          Manuel import
        </Link>
      </div>

      <FetchOffersButton initialPending={pendingCount ?? 0} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Kunne ikke hente tilbud: {error.message}.{" "}
          <Link href="/tilbud/import" className="underline">
            Brug manuel import i stedet
          </Link>
          .
        </div>
      )}

      {!error && offers.length === 0 && (
        <p className="text-sm text-gray-500">
          Ingen tilbud endnu. Tryk &quot;Hent tilbud igen&quot;, eller brug{" "}
          <Link href="/tilbud/import" className="underline">
            manuel import
          </Link>
          .
        </p>
      )}

      {offers.length > 0 && <OfferBrowser offers={offers} />}
    </div>
  );
}
