"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { beginGeneration, resolveBatch, finalizeGeneration, beginFix } from "@/app/(app)/planlaeg-uge/actions";

const DAY_OFFSETS = [
  ["mon", 0],
  ["tue", 1],
  ["wed", 2],
  ["thu", 3],
  ["fri", 4],
  ["sat", 5],
  ["sun", 6],
] as const;
const DAY_LABELS: Record<string, string> = { mon: "Man", tue: "Tir", wed: "Ons", thu: "Tor", fri: "Fre", sat: "Lør", sun: "Søn" };
const MEAL_TYPES = ["morgenmad", "frokost", "aftensmad", "snack"] as const;
type MealType = (typeof MEAL_TYPES)[number];
type MacroMode = "fri" | "minimum" | "balanceret" | "skarp";

type Cell = { on: boolean; who: "begge"; guests: number; leftover?: boolean };
type Grid = Record<string, Partial<Record<MealType, Cell>>>;

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildInitialGrid(weekStart: string, defaultGrid: Record<string, Record<string, boolean>>): Grid {
  const grid: Grid = {};
  for (const [dayKey, offset] of DAY_OFFSETS) {
    const date = addDays(weekStart, offset);
    grid[date] = {};
    for (const mealType of MEAL_TYPES) {
      const on = defaultGrid?.[dayKey]?.[mealType] ?? false;
      grid[date]![mealType] = { on, who: "begge", guests: 0 };
    }
  }
  return grid;
}

type Props = {
  weekStart: string;
  defaultMealGrid: Record<string, Record<string, boolean>>;
  defaultBudget: number;
  defaultBudgetType: "loft" | "mål";
  maxStores: number;
  primaryStoreId: string | null;
  people: { id: string; name: string }[];
  useSoonItems: { id: string; name: string; quantity: number | null; unit: string | null }[];
};

export default function PlanWizard({
  weekStart,
  defaultMealGrid,
  defaultBudget,
  defaultBudgetType,
  maxStores,
  primaryStoreId,
  people,
  useSoonItems,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [grid, setGrid] = useState<Grid>(() => buildInitialGrid(weekStart, defaultMealGrid));
  const [budget, setBudget] = useState(defaultBudget);
  const [budgetType, setBudgetType] = useState<"loft" | "mål">(defaultBudgetType);
  const [macroModes, setMacroModes] = useState<Record<string, MacroMode>>(() =>
    Object.fromEntries(people.map((p) => [p.id, "fri" as MacroMode])),
  );
  const [wishes, setWishes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dates = useMemo(() => DAY_OFFSETS.map(([, offset]) => addDays(weekStart, offset)), [weekStart]);

  function toggleCell(date: string, mealType: MealType) {
    setGrid((prev) => {
      const cell = prev[date]?.[mealType] ?? { on: false, who: "begge" as const, guests: 0 };
      return { ...prev, [date]: { ...prev[date], [mealType]: { ...cell, on: !cell.on } } };
    });
  }

  function toggleLeftover(date: string) {
    setGrid((prev) => {
      const cell = prev[date]?.frokost ?? { on: false, who: "begge" as const, guests: 0 };
      return { ...prev, [date]: { ...prev[date], frokost: { ...cell, leftover: !cell.leftover } } };
    });
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setStatus("Genererer forslag til ugens retter…");

    const params = {
      weekStart,
      mealGrid: grid,
      macroModes,
      budget,
      budgetType,
      wishes,
      maxStores,
      primaryStoreId,
    };

    try {
      const started = await beginGeneration(params);
      if ("error" in started && started.error) {
        setError(started.error);
        setIsGenerating(false);
        return;
      }
      if (!("planId" in started)) {
        setError("Uventet svar fra serveren.");
        setIsGenerating(false);
        return;
      }
      const planId = started.planId;

      let remaining = started.remaining;
      while (remaining > 0) {
        setStatus(`Matcher og prissætter ingredienser… ${remaining} tilbage`);
        const batch = await resolveBatch(planId);
        if ("error" in batch && batch.error) {
          setError(batch.error);
          setIsGenerating(false);
          return;
        }
        remaining = "remaining" in batch ? batch.remaining : 0;
      }

      setStatus("Beregner butiksvalg, priser og status…");
      let result = await finalizeGeneration(planId);
      if ("error" in result && result.error) {
        setError(result.error);
        setIsGenerating(false);
        return;
      }

      let round = "round" in result ? result.round : 0;
      let violations = "violations" in result ? result.violations : [];

      while (violations.length > 0 && round < 2) {
        setStatus(`Retter planen til (${violations.length} ting at rette)…`);
        const fix = await beginFix(planId);
        if ("error" in fix && fix.error) {
          setError(fix.error);
          break;
        }
        if (!("planId" in fix) || fix.done) break;

        let fixRemaining = fix.remaining;
        while (fixRemaining > 0) {
          setStatus(`Matcher og prissætter ingredienser… ${fixRemaining} tilbage`);
          const batch = await resolveBatch(planId);
          if ("error" in batch && batch.error) {
            setError(batch.error);
            fixRemaining = 0;
            break;
          }
          fixRemaining = "remaining" in batch ? batch.remaining : 0;
        }

        setStatus("Beregner butiksvalg, priser og status…");
        result = await finalizeGeneration(planId);
        if ("error" in result && result.error) {
          setError(result.error);
          break;
        }
        round = "round" in result ? result.round : round;
        violations = "violations" in result ? result.violations : [];
      }

      setStatus("Færdig. Viser ugens plan…");
      router.push("/denne-uge");
    } catch (err) {
      setError(
        "Noget gik galt undervejs (muligvis en tidsgrænse på serveren): " +
          (err instanceof Error ? err.message : "ukendt fejl") +
          ". Prøv igen - allerede genererede dele af planen er gemt.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-400">Trin {step} af 6</p>

      {step === 1 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-semibold text-gray-700">1. Dage og måltider</legend>
          {dates.map((date) => (
            <div key={date} className="rounded-lg border border-gray-200 p-2">
              <p className="mb-1 text-sm font-medium text-gray-700">
                {DAY_LABELS[DAY_OFFSETS.find(([, o]) => addDays(weekStart, o) === date)![0]]} ({date})
              </p>
              <div className="flex flex-wrap gap-3">
                {MEAL_TYPES.map((mealType) => (
                  <label key={mealType} className="flex items-center gap-1 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={grid[date]?.[mealType]?.on ?? false}
                      onChange={() => toggleCell(date, mealType)}
                    />
                    {mealType}
                  </label>
                ))}
              </div>
              {grid[date]?.frokost?.on && (
                <label className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                  <input type="checkbox" checked={grid[date]?.frokost?.leftover ?? false} onChange={() => toggleLeftover(date)} />
                  Frokost er rester fra aftensmaden dagen før
                </label>
              )}
            </div>
          ))}
          <p className="text-xs text-gray-400">Begge spiser med i alle planlagte måltider (gæster og individuelle måltider kan tilføjes senere).</p>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-semibold text-gray-700">2. Budget</legend>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Budget for ugen (kr.)
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Type
            <select
              value={budgetType}
              onChange={(e) => setBudgetType(e.target.value as "loft" | "mål")}
              className="rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="mål">Mål (må gå op til 10 % over)</option>
              <option value="loft">Loft (må ikke overstiges)</option>
            </select>
          </label>
        </fieldset>
      )}

      {step === 3 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-semibold text-gray-700">3. Makrotilstand</legend>
          {people.map((p) => (
            <label key={p.id} className="flex items-center justify-between text-sm text-gray-600">
              {p.name}
              <select
                value={macroModes[p.id] ?? "fri"}
                onChange={(e) => setMacroModes((prev) => ({ ...prev, [p.id]: e.target.value as MacroMode }))}
                className="rounded-lg border border-gray-300 px-2 py-1"
              >
                <option value="fri">Fri</option>
                <option value="minimum">Minimum</option>
                <option value="balanceret">Balanceret</option>
                <option value="skarp">Skarp</option>
              </select>
            </label>
          ))}
        </fieldset>
      )}

      {step === 4 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-gray-700">4. Brug snart</legend>
          {useSoonItems.length === 0 ? (
            <p className="text-sm text-gray-500">Intet markeret &quot;brug snart&quot; i beholdningen.</p>
          ) : (
            <ul className="text-sm text-gray-600">
              {useSoonItems.map((item) => (
                <li key={item.id}>
                  {item.name} {item.quantity ? `(${item.quantity}${item.unit ?? ""})` : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-400">Disse bruges tidligt på ugen i planen.</p>
        </fieldset>
      )}

      {step === 5 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-gray-700">5. Ønsker</legend>
          <textarea
            value={wishes}
            onChange={(e) => setWishes(e.target.value)}
            rows={3}
            placeholder="fx 'noget med fisk', 'hurtigt onsdag'"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </fieldset>
      )}

      {step === 6 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-semibold text-gray-700">6. Generér</legend>
          <p className="text-sm text-gray-500">Klar til at lave ugens plan. Det kan tage et minuts tid.</p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="rounded-lg bg-green-600 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
          >
            {isGenerating ? "Genererer…" : "Generér madplan"}
          </button>
          {status && <p className="text-sm text-gray-600">{status}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </fieldset>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1 || isGenerating}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-40"
        >
          Tilbage
        </button>
        {step < 6 && (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(6, s + 1))}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white"
          >
            Næste
          </button>
        )}
      </div>
    </div>
  );
}
