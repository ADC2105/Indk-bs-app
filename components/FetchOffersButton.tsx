"use client";

import { useTransition, useState } from "react";
import { fetchOffersFromTjek } from "@/app/(app)/tilbud/actions";

export default function FetchOffersButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await fetchOffersFromTjek();
      if ("error" in result && result.error) {
        setMessage(result.error);
      } else if ("warning" in result && result.warning) {
        setMessage(result.warning);
      } else if ("count" in result) {
        setMessage(`Hentede ${result.count} tilbud.`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Henter tilbud…" : "Hent tilbud igen"}
      </button>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
