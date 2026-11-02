"use client";

import { useState, useTransition } from "react";
import { addStaples } from "@/app/(app)/beholdning/actions";

const COMMON_STAPLES = [
  "Salt",
  "Peber",
  "Olivenolie",
  "Rapsolie",
  "Mel",
  "Sukker",
  "Bouillon",
  "Karry",
  "Paprika",
  "Kanel",
  "Eddike",
  "Sojasovs",
  "Dijonsennep",
  "Hvidløg",
  "Ris",
];

export default function StaplesChecklist() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleAdd() {
    startTransition(async () => {
      await addStaples(Array.from(selected));
      setSelected(new Set());
      setDone(true);
    });
  }

  return (
    <details className="rounded-lg border border-gray-200 p-3">
      <summary className="cursor-pointer text-sm font-medium text-gray-700">
        Førstegangsopsætning: almindelige basisvarer
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {COMMON_STAPLES.map((name) => (
          <label
            key={name}
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
              selected.has(name) ? "border-green-600 bg-green-50 text-green-700" : "border-gray-300 text-gray-600"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.has(name)}
              onChange={() => toggle(name)}
              className="sr-only"
            />
            {name}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={isPending || selected.size === 0}
        className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Tilføjer…" : `Tilføj ${selected.size || ""} basisvare(r)`}
      </button>
      {done && <p className="mt-2 text-sm text-green-700">Tilføjet.</p>}
    </details>
  );
}
