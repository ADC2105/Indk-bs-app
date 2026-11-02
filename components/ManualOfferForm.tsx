"use client";

import { useTransition } from "react";
import { addManualOffer } from "@/app/(app)/tilbud/actions";

type Store = { id: string; name: string };

const CATEGORIES: { value: string; label: string }[] = [
  { value: "frugt_grønt", label: "Frugt og grønt" },
  { value: "kød", label: "Kød" },
  { value: "fisk", label: "Fisk" },
  { value: "mejeri_æg", label: "Mejeri og æg" },
  { value: "brød", label: "Brød" },
  { value: "kolonial", label: "Kolonial" },
  { value: "frost", label: "Frost" },
  { value: "drikke", label: "Drikke" },
  { value: "snacks", label: "Snacks" },
  { value: "andet", label: "Andet" },
];

export default function ManualOfferForm({ stores }: { stores: Store[] }) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await addManualOffer(formData);
    });
  }

  return (
    <form action={handleSubmit} className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 p-3">
      <h2 className="col-span-2 text-sm font-semibold text-gray-700">Tilføj ét tilbud i hånden</h2>

      <select name="store_id" required className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm">
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <input
        name="heading"
        placeholder="Overskrift (fx 'Hakket oksekød 8-12%')"
        required
        className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        name="ingredient_name"
        placeholder="Generisk navn (fx 'hakket oksekød')"
        required
        className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />

      <select name="category" required className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm">
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      <input
        name="price"
        type="number"
        step="0.01"
        placeholder="Pris (kr.)"
        required
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        name="pack_count"
        type="number"
        step="1"
        defaultValue={1}
        placeholder="Antal enheder"
        required
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        name="pack_size"
        type="number"
        step="1"
        placeholder="Størrelse pr. enhed"
        required
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <select name="pack_unit" required className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
        <option value="g">g</option>
        <option value="ml">ml</option>
        <option value="stk">stk</option>
      </select>

      <button
        type="submit"
        disabled={isPending}
        className="col-span-2 mt-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Gemmer…" : "Tilføj tilbud"}
      </button>
    </form>
  );
}
