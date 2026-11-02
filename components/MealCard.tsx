"use client";

import { useState, useTransition } from "react";
import { changeServings, confirmSwap, requestSwapOptions, toggleLock, type SwapOption } from "@/app/(app)/denne-uge/actions";

type Recipe = {
  title: string;
  description: string | null;
  base_servings: number;
  prep_minutes: number | null;
  steps: string[];
  recipe_ingredients: { name: string; grams_raw: number }[];
};

type Props = {
  id: string;
  mealType: string;
  locked: boolean;
  servings: number;
  status: string | null;
  recipe: Recipe | null;
};

const STATUS_DOT: Record<string, string> = { grøn: "bg-green-500", gul: "bg-amber-500", rød: "bg-red-500" };

export default function MealCard({ id, mealType, locked: initialLocked, servings: initialServings, status, recipe }: Props) {
  const [isPending, startTransition] = useTransition();
  const [locked, setLocked] = useState(initialLocked);
  const [servings, setServings] = useState(initialServings);
  const [expanded, setExpanded] = useState(false);
  const [swapOptions, setSwapOptions] = useState<SwapOption[] | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);

  function handleToggleLock() {
    const next = !locked;
    setLocked(next);
    startTransition(async () => {
      await toggleLock(id, next);
    });
  }

  function handleServings(delta: number) {
    const next = Math.max(1, servings + delta);
    setServings(next);
    startTransition(async () => {
      await changeServings(id, next);
    });
  }

  function handleSwapClick() {
    setSwapError(null);
    setSwapLoading(true);
    startTransition(async () => {
      const result = await requestSwapOptions(id);
      setSwapLoading(false);
      if ("error" in result && result.error) {
        setSwapError(result.error);
        return;
      }
      if ("options" in result) setSwapOptions(result.options ?? null);
    });
  }

  function handleChooseOption(option: SwapOption) {
    startTransition(async () => {
      await confirmSwap(id, option.meal);
      setSwapOptions(null);
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-gray-900">
            {status && <span className={`mr-2 inline-block h-2 w-2 rounded-full ${STATUS_DOT[status] ?? "bg-gray-300"}`} />}
            {recipe?.title ?? "(ingen ret)"}
          </p>
          <p className="text-xs text-gray-500">
            {mealType} · {servings} portioner{recipe?.prep_minutes ? ` · ${recipe.prep_minutes} min` : ""}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleServings(-1)}
            className="h-7 w-7 rounded-full border border-gray-300 text-sm"
            aria-label="Færre portioner"
          >
            −
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleServings(1)}
            className="h-7 w-7 rounded-full border border-gray-300 text-sm"
            aria-label="Flere portioner"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={handleToggleLock}
          className={`rounded-full border px-2 py-1 text-xs ${
            locked ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-500"
          }`}
        >
          {locked ? "Låst" : "Lås"}
        </button>
        {!locked && (
          <button
            type="button"
            disabled={swapLoading}
            onClick={handleSwapClick}
            className="rounded-full border border-gray-300 px-2 py-1 text-xs text-gray-500"
          >
            {swapLoading ? "Henter…" : "Byt"}
          </button>
        )}
      </div>

      {swapError && <p className="mt-2 text-xs text-red-600">{swapError}</p>}

      {swapOptions && (
        <div className="mt-2 flex flex-col gap-2">
          {swapOptions.map((option, i) => (
            <div key={i} className="rounded-lg bg-gray-50 p-2">
              <p className="text-sm font-medium text-gray-800">{option.meal.title}</p>
              <p className="text-xs text-gray-500">
                {option.costDelta >= 0 ? "+" : ""}
                {option.costDelta.toFixed(0)} kr · {option.proteinDelta >= 0 ? "+" : ""}
                {option.proteinDelta.toFixed(0)} g protein · {option.kcalDelta >= 0 ? "+" : ""}
                {option.kcalDelta.toFixed(0)} kcal
              </p>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleChooseOption(option)}
                className="mt-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white"
              >
                Vælg
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setSwapOptions(null)} className="text-xs text-gray-400">
            Annullér
          </button>
        </div>
      )}

      {expanded && recipe && (
        <div className="mt-2 border-t border-gray-100 pt-2 text-sm text-gray-600">
          {recipe.description && <p className="mb-2">{recipe.description}</p>}
          <p className="mb-1 font-medium text-gray-700">Ingredienser</p>
          <ul className="mb-2 list-disc pl-5">
            {recipe.recipe_ingredients.map((ing, i) => (
              <li key={i}>
                {ing.name} - {Math.round(ing.grams_raw)} g
              </li>
            ))}
          </ul>
          <p className="mb-1 font-medium text-gray-700">Fremgangsmåde</p>
          <ol className="list-decimal pl-5">
            {recipe.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
