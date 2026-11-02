"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parsePantryText, pantryParseItemSchema } from "@/lib/ai/pantryParse";
import { matchIngredientToFood } from "@/lib/foods/matchIngredient";

export async function previewPantryText(text: string) {
  if (!text.trim()) {
    return { ok: true as const, items: [] as z.infer<typeof pantryParseItemSchema>[] };
  }
  const supabase = await createClient();
  try {
    const result = await parsePantryText(supabase, text);
    return { ok: true as const, items: result.items };
  } catch {
    return {
      ok: false as const,
      error: "Kunne ikke tolke teksten. Prøv at omformulere, eller tilføj varen i hånden.",
    };
  }
}

const confirmSchema = z.array(
  z.object({
    name: z.string().min(1),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    location: z.enum(["køleskab", "fryser", "skab"]).nullable(),
  }),
);

export async function confirmPantryItems(items: unknown) {
  const parsed = confirmSchema.safeParse(items);
  if (!parsed.success || parsed.data.length === 0) {
    return { error: "Ingen gyldige varer at gemme." };
  }

  const supabase = await createClient();
  const { data: saved, error } = await supabase
    .from("pantry_items")
    .insert(
      parsed.data.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location,
      })),
    )
    .select("id, name");

  if (error) {
    return { error: "Kunne ikke gemme varerne: " + error.message };
  }

  // Match hver vare til næringsdata (Frida eller et AI-estimat). Fejl her må
  // ikke forhindre, at varerne er gemt i beholdningen.
  for (const item of saved ?? []) {
    try {
      const foodId = await matchIngredientToFood(supabase, item.name);
      if (foodId) {
        await supabase.from("pantry_items").update({ food_id: foodId }).eq("id", item.id);
      }
    } catch {
      // Beholdningen vises stadig uden næringsdata for denne vare.
    }
  }

  revalidatePath("/beholdning");
  return { ok: true };
}

export async function addStaples(names: string[]) {
  if (names.length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("pantry_items").insert(
    names.map((name) => ({
      name,
      is_staple: true,
      location: "skab",
    })),
  );

  if (error) {
    return { error: "Kunne ikke gemme basisvarerne: " + error.message };
  }

  revalidatePath("/beholdning");
  return { ok: true };
}

export async function adjustQuantity(id: string, delta: number) {
  const supabase = await createClient();
  const { data: item, error: fetchError } = await supabase
    .from("pantry_items")
    .select("quantity")
    .eq("id", id)
    .single();

  if (fetchError || !item) {
    return { error: "Varen blev ikke fundet." };
  }

  const newQuantity = Math.max(0, (item.quantity ?? 0) + delta);
  const { error } = await supabase
    .from("pantry_items")
    .update({ quantity: newQuantity })
    .eq("id", id);

  if (error) {
    return { error: "Kunne ikke opdatere mængden: " + error.message };
  }

  revalidatePath("/beholdning");
  return { ok: true };
}

export async function toggleUseSoon(id: string, useSoon: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pantry_items")
    .update({ use_soon: useSoon })
    .eq("id", id);

  if (error) {
    return { error: "Kunne ikke opdatere varen: " + error.message };
  }

  revalidatePath("/beholdning");
  return { ok: true };
}

export async function deletePantryItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pantry_items").delete().eq("id", id);

  if (error) {
    return { error: "Kunne ikke slette varen: " + error.message };
  }

  revalidatePath("/beholdning");
  return { ok: true };
}
