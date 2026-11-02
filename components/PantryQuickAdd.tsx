"use client";

import { useState, useTransition } from "react";
import { confirmPantryItems, previewPantryText } from "@/app/(app)/beholdning/actions";

type PreviewItem = {
  name: string;
  quantity: number | null;
  unit: string | null;
  location: "køleskab" | "fryser" | "skab" | null;
};

const locations = ["køleskab", "fryser", "skab"] as const;
const units = ["g", "kg", "ml", "l", "stk"] as const;

export default function PantryQuickAdd() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleTolk() {
    setError(null);
    startTransition(async () => {
      const result = await previewPantryText(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.items.length === 0) {
        setError("Fandt ingen varer i teksten. Prøv at omformulere.");
        return;
      }
      setPreview(result.items as PreviewItem[]);
    });
  }

  function updateItem(index: number, patch: Partial<PreviewItem>) {
    setPreview((prev) =>
      prev ? prev.map((item, i) => (i === index ? { ...item, ...patch } : item)) : prev,
    );
  }

  function removeItem(index: number) {
    setPreview((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  function handleGodkend() {
    if (!preview || preview.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmPantryItems(preview);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setPreview(null);
      setText("");
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <label htmlFor="pantry-text" className="text-sm font-medium text-gray-700">
        Hurtig tilføjelse
      </label>
      <textarea
        id="pantry-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="fx 500 g pasta, 2 kg kartofler, 1 spidskål"
        rows={2}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
      />
      <button
        type="button"
        onClick={handleTolk}
        disabled={isPending || !text.trim()}
        className="mt-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending && !preview ? "Tolker…" : "Tolk tekst"}
      </button>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {preview && preview.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm text-gray-500">Gennemse og ret, før du godkender:</p>
          {preview.map((item, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2">
              <input
                value={item.name}
                onChange={(e) => updateItem(index, { name: e.target.value })}
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <input
                type="number"
                value={item.quantity ?? ""}
                onChange={(e) =>
                  updateItem(index, {
                    quantity: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="mængde"
                className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <select
                value={item.unit ?? ""}
                onChange={(e) => updateItem(index, { unit: e.target.value || null })}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="">enhed</option>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <select
                value={item.location ?? ""}
                onChange={(e) =>
                  updateItem(index, {
                    location: (e.target.value || null) as PreviewItem["location"],
                  })
                }
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="">placering</option>
                {locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="text-sm text-red-600"
                aria-label={`Fjern ${item.name}`}
              >
                Fjern
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleGodkend}
            disabled={isPending}
            className="mt-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isPending ? "Gemmer…" : `Godkend ${preview.length} vare(r)`}
          </button>
        </div>
      )}
    </div>
  );
}
