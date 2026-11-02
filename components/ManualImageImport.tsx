"use client";

import { useState, useTransition } from "react";
import { importOffersFromImages } from "@/app/(app)/tilbud/actions";

type Store = { id: string; name: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ManualImageImport({ stores }: { stores: Store[] }) {
  const [files, setFiles] = useState<File[]>([]);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setMessage(null);
    startTransition(async () => {
      const images = await Promise.all(
        files.map(async (file) => ({
          base64: await fileToBase64(file),
          mediaType: (file.type as "image/png" | "image/jpeg" | "image/webp") || "image/png",
        })),
      );
      const result = await importOffersFromImages(images, storeId);
      if ("error" in result && result.error) {
        setMessage(result.error);
      } else if ("count" in result) {
        setMessage(`Tilføjede ${result.count} tilbud.`);
        setFiles([]);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
      <h2 className="text-sm font-semibold text-gray-700">Upload screenshots af avisen</h2>
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
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="text-sm"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending || files.length === 0 || !storeId}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Tolker…" : `Udtræk tilbud fra ${files.length || ""} billede(r)`}
      </button>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
