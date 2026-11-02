"use client";

import { useTransition } from "react";
import { deletePerson, savePerson } from "@/app/(app)/indstillinger/actions";

type Person = {
  id: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

function PersonForm({ person }: { person: Person | null }) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await savePerson(person?.id ?? null, formData);
    });
  }

  return (
    <form action={handleSubmit} className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 p-3">
      <label className="col-span-2 flex flex-col gap-1 text-sm text-gray-600">
        Navn
        <input
          name="name"
          required
          defaultValue={person?.name ?? ""}
          className="rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        Kalorier
        <input
          name="kcal"
          type="number"
          required
          defaultValue={person?.kcal ?? ""}
          className="rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        Protein (g)
        <input
          name="protein_g"
          type="number"
          required
          defaultValue={person?.protein_g ?? ""}
          className="rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        Kulhydrat (g)
        <input
          name="carbs_g"
          type="number"
          required
          defaultValue={person?.carbs_g ?? ""}
          className="rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        Fedt (g)
        <input
          name="fat_g"
          type="number"
          required
          defaultValue={person?.fat_g ?? ""}
          className="rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>
      <div className="col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Gemmer…" : person ? "Gem" : "Tilføj person"}
        </button>
        {person && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(async () => { await deletePerson(person.id); })}
            className="text-sm text-red-600"
          >
            Slet
          </button>
        )}
      </div>
    </form>
  );
}

export default function PeopleEditor({ people }: { people: Person[] }) {
  return (
    <div className="flex flex-col gap-3">
      {people.map((person) => (
        <PersonForm key={person.id} person={person} />
      ))}
      <PersonForm person={null} />
    </div>
  );
}
