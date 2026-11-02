"use client";

import { useState, useTransition } from "react";
import { fetchOffersFromTjek, normalizeNextBatch } from "@/app/(app)/tilbud/actions";

export default function FetchOffersButton({ initialPending = 0 }: { initialPending?: number }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(initialPending);

  async function runNormalizationLoop() {
    for (;;) {
      const result = await normalizeNextBatch();
      if ("error" in result && result.error) {
        setMessage(result.error);
        return;
      }
      const left = result.remaining ?? 0;
      setRemaining(left);
      setMessage(left > 0 ? `Normaliserer tilbud… ${left} tilbage` : "Alle tilbud er normaliseret.");
      if (left === 0) return;
    }
  }

  function handleFetch() {
    setMessage(null);
    startTransition(async () => {
      const result = await fetchOffersFromTjek();
      if ("error" in result && result.error) {
        setMessage(result.error);
        return;
      }
      if ("count" in result) {
        setMessage(`Hentede ${result.count} tilbud. Normaliserer…`);
      }
      await runNormalizationLoop();
    });
  }

  function handleResumeNormalize() {
    setMessage(null);
    startTransition(runNormalizationLoop);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleFetch}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Arbejder…" : "Hent tilbud igen"}
      </button>
      {!isPending && remaining > 0 && (
        <button
          type="button"
          onClick={handleResumeNormalize}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          Normaliser ventende tilbud ({remaining})
        </button>
      )}
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
