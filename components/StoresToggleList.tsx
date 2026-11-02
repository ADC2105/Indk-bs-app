"use client";

import { useTransition } from "react";
import { toggleStore } from "@/app/(app)/indstillinger/actions";

type Store = { id: string; name: string; enabled: boolean };

export default function StoresToggleList({ stores }: { stores: Store[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <ul className="flex flex-col gap-2">
      {stores.map((store) => (
        <li key={store.id} className="flex items-center justify-between">
          <span className="text-sm text-gray-700">{store.name}</span>
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <input
              type="checkbox"
              checked={store.enabled}
              disabled={isPending}
              onChange={(e) => {
                const checked = e.target.checked;
                startTransition(async () => {
                  await toggleStore(store.id, checked);
                });
              }}
            />
            Bruges
          </label>
        </li>
      ))}
    </ul>
  );
}
