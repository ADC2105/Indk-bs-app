"use client";

import { useState, useTransition } from "react";
import { importOffersFromText } from "@/app/(app)/tilbud/actions";

type Store = { id: string; name: string };

export default function ManualTextImport({ stores }: { stores: Store[] }) {
  const [text, setText] = useState("");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setMessage(null);
    startTransition(async () => {
      const result = await importOffersFromText(text, storeId);
      if ("error" in result && result.error) {
        setMessage(result.error);
      } else if ("count" in result) {
        setMessage(`Tilføjede ${result.count} tilbud.`);
        setText("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
      <h2 className="text-sm font-semibold text-gray-700">Indsæt tekst fra en tilbudsavis</h2>
      <select
        value={storeId}
        onChange={(e) => setStoreId(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Kopiér og indsæt tekst fra tilbudsavisen her"
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || !text.trim() || !storeId}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Tolker…" : "Udtræk tilbud"}
      </button>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
