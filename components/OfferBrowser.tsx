"use client";

import { useMemo, useState, useTransition } from "react";
import { setOfferWanted } from "@/app/(app)/tilbud/actions";
import { computeUnitPrice } from "@/lib/calc/unitPrice";

export type OfferRow = {
  id: string;
  store_name: string;
  heading: string;
  ingredient_name: string | null;
  category: string | null;
  price: number | null;
  quantity_text: string | null;
  pack_count: number | null;
  pack_size: number | null;
  pack_unit: "g" | "ml" | "stk" | null;
  total_price: number | null;
  needs_review: boolean;
  is_food: boolean | null;
  wanted: boolean | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  frugt_grønt: "Frugt og grønt",
  kød: "Kød",
  fisk: "Fisk",
  mejeri_æg: "Mejeri og æg",
  brød: "Brød",
  kolonial: "Kolonial",
  frost: "Frost",
  drikke: "Drikke",
  snacks: "Snacks",
  andet: "Andet",
};

function OfferCard({ offer }: { offer: OfferRow }) {
  const [isPending, startTransition] = useTransition();
  const [wanted, setWanted] = useState(offer.wanted);

  function update(value: boolean | null) {
    const next = wanted === value ? null : value;
    setWanted(next);
    startTransition(async () => {
      await setOfferWanted(offer.id, next);
    });
  }

  const unitPrice =
    offer.pack_count && offer.pack_size && offer.pack_unit && offer.total_price
      ? computeUnitPrice({
          packCount: offer.pack_count,
          packSize: offer.pack_size,
          packUnit: offer.pack_unit,
          totalPrice: offer.total_price,
        })
      : null;

  return (
    <li className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 p-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-900">
          {offer.heading}
          {offer.needs_review && <span title="Usikker tolkning"> ⚠️</span>}
        </p>
        <p className="text-xs text-gray-500">
          {offer.quantity_text ?? ""} {offer.price != null ? `· ${offer.price} kr.` : ""}
          {unitPrice?.kiloPris ? ` · ${unitPrice.kiloPris.toFixed(0)} kr./kg` : ""}
          {unitPrice?.literPris ? ` · ${unitPrice.literPris.toFixed(0)} kr./l` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          disabled={isPending}
          onClick={() => update(true)}
          className={`rounded-full border px-2 py-1 text-xs ${
            wanted === true ? "border-green-600 bg-green-50 text-green-700" : "border-gray-300 text-gray-500"
          }`}
        >
          Skal med
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => update(false)}
          className={`rounded-full border px-2 py-1 text-xs ${
            wanted === false ? "border-red-500 bg-red-50 text-red-600" : "border-gray-300 text-gray-500"
          }`}
        >
          Nej tak
        </button>
      </div>
    </li>
  );
}

export default function OfferBrowser({ offers }: { offers: OfferRow[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const categories = useMemo(
    () => Array.from(new Set(offers.map((o) => o.category).filter(Boolean))) as string[],
    [offers],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return offers.filter((o) => {
      if (o.is_food !== true) return false; // skjul endnu ikke normaliserede og nonfood
      if (category && o.category !== category) return false;
      if (term) {
        const haystack = `${o.heading} ${o.ingredient_name ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [offers, search, category]);

  const byStore = useMemo(() => {
    const map = new Map<string, OfferRow[]>();
    for (const offer of filtered) {
      const list = map.get(offer.store_name) ?? [];
      list.push(offer);
      map.set(offer.store_name, list);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søg i tilbud…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Alle kategorier</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c] ?? c}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 && <p className="text-sm text-gray-500">Ingen tilbud matcher.</p>}

      {Array.from(byStore.entries()).map(([storeName, storeOffers]) => (
        <section key={storeName}>
          <h2 className="mb-1 text-sm font-semibold text-gray-700">{storeName}</h2>
          <ul className="flex flex-col gap-1">
            {storeOffers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
