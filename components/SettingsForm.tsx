"use client";

import { useTransition } from "react";
import { saveSettings, DAYS, DAY_LABELS, MEAL_TYPES } from "@/app/(app)/indstillinger/actions";

type Store = { id: string; name: string };

type Settings = {
  lat: number | null;
  lng: number | null;
  radius_km: number;
  shopping_day: number;
  max_stores: number;
  primary_store_id: string | null;
  default_budget: number;
  budget_type: "loft" | "mål";
  default_meal_grid: Record<string, Record<string, boolean>>;
  meal_shares: Record<string, number>;
  guest_portion_kcal: number;
  max_prep_weekday_min: number;
  dislikes: string[];
  allergies: string[];
};

export default function SettingsForm({ settings, stores }: { settings: Settings; stores: Store[] }) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await saveSettings(formData);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-gray-700">Placering og butikker</legend>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Breddegrad
            <input
              name="lat"
              type="number"
              step="any"
              defaultValue={settings.lat ?? ""}
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Længdegrad
            <input
              name="lng"
              type="number"
              step="any"
              defaultValue={settings.lng ?? ""}
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Radius (km)
          <input
            name="radius_km"
            type="number"
            step="1"
            defaultValue={settings.radius_km}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Indkøbsdag
          <select
            name="shopping_day"
            defaultValue={settings.shopping_day}
            className="rounded-lg border border-gray-300 px-3 py-2"
          >
            {DAYS.map((day, i) => (
              <option key={day} value={i + 1}>
                {DAY_LABELS[day]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Højst antal butikker pr. uge
          <input
            name="max_stores"
            type="number"
            min={1}
            max={4}
            defaultValue={settings.max_stores}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Primær butik
          <select
            name="primary_store_id"
            defaultValue={settings.primary_store_id ?? ""}
            className="rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="">Ingen valgt</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-gray-700">Budget</legend>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Standardbudget (kr./uge)
          <input
            name="default_budget"
            type="number"
            step="1"
            defaultValue={settings.default_budget}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Budgettype
          <select
            name="budget_type"
            defaultValue={settings.budget_type}
            className="rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="mål">Mål (må gå op til 10 % over)</option>
            <option value="loft">Loft (må ikke overstiges)</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-gray-700">Standard måltidsgitter</legend>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-sm">
            <thead>
              <tr>
                <th className="text-left font-normal text-gray-500"></th>
                {DAYS.map((day) => (
                  <th key={day} className="px-1 font-normal text-gray-500">
                    {DAY_LABELS[day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_TYPES.map((meal) => (
                <tr key={meal}>
                  <td className="text-left text-gray-600">{meal}</td>
                  {DAYS.map((day) => (
                    <td key={day}>
                      <input
                        type="checkbox"
                        name={`grid.${day}.${meal}`}
                        defaultChecked={settings.default_meal_grid?.[day]?.[meal] ?? false}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-gray-700">Måltidsandele af dagens mål</legend>
        {MEAL_TYPES.map((meal) => (
          <label key={meal} className="flex items-center justify-between text-sm text-gray-600">
            {meal}
            <input
              name={`${meal}_share`}
              type="number"
              step="0.01"
              min={0}
              max={1}
              defaultValue={settings.meal_shares?.[meal] ?? 0}
              className="w-24 rounded-lg border border-gray-300 px-2 py-1"
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-gray-700">Gæster og tilberedning</legend>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Standardportion til gæster (kcal)
          <input
            name="guest_portion_kcal"
            type="number"
            defaultValue={settings.guest_portion_kcal}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Maks. tilberedningstid på hverdage (minutter)
          <input
            name="max_prep_weekday_min"
            type="number"
            defaultValue={settings.max_prep_weekday_min}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-gray-700">Vi spiser ikke / allergier</legend>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Ting vi ikke spiser (kommasepareret)
          <input
            name="dislikes"
            defaultValue={settings.dislikes.join(", ")}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          Allergier (kommasepareret)
          <input
            name="allergies"
            defaultValue={settings.allergies.join(", ")}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      </fieldset>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-green-600 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
      >
        {isPending ? "Gemmer…" : "Gem indstillinger"}
      </button>
    </form>
  );
}
