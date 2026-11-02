"use client";

import { useTransition } from "react";
import { adjustQuantity, deletePantryItem, toggleUseSoon } from "@/app/(app)/beholdning/actions";

type Props = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  useSoon: boolean;
  isStaple: boolean;
  food?: { kcal: number; protein: number; carbs: number; fat: number; source: string } | null;
};

export default function PantryItemRow({ id, name, quantity, unit, useSoon, isStaple, food }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-900">{name}</p>
        <p className="text-xs text-gray-500">
          {quantity != null ? `${quantity}${unit ? " " + unit : ""}` : "ukendt mængde"}
          {useSoon && " · brug snart"}
        </p>
        {food && (
          <p className="text-xs text-gray-400">
            {food.source === "estimate" && "≈ "}
            {Math.round(food.kcal)} kcal · {Math.round(food.protein)} g protein · {Math.round(food.carbs)} g kulhydrat ·{" "}
            {Math.round(food.fat)} g fedt{" "}
            <span className="text-gray-300">(pr. 100 g)</span>
          </p>
        )}
      </div>

      {!isStaple && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(async () => { await adjustQuantity(id, -1); })}
            className="h-8 w-8 rounded-full border border-gray-300 text-lg leading-none text-gray-700"
            aria-label={`Mindre ${name}`}
          >
            −
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(async () => { await adjustQuantity(id, 1); })}
            className="h-8 w-8 rounded-full border border-gray-300 text-lg leading-none text-gray-700"
            aria-label={`Mere ${name}`}
          >
            +
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => { await toggleUseSoon(id, !useSoon); })}
        className={`rounded-full border px-2 py-1 text-xs ${
          useSoon ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-300 text-gray-500"
        }`}
      >
        Brug snart
      </button>

      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => { await deletePantryItem(id); })}
        className="text-xs text-red-600"
        aria-label={`Slet ${name}`}
      >
        Slet
      </button>
    </li>
  );
}
