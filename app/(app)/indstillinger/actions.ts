"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  mon: "Man",
  tue: "Tir",
  wed: "Ons",
  thu: "Tor",
  fri: "Fre",
  sat: "Lør",
  sun: "Søn",
};
export const MEAL_TYPES = ["morgenmad", "frokost", "aftensmad", "snack"] as const;

const settingsSchema = z.object({
  lat: z.coerce.number().nullable(),
  lng: z.coerce.number().nullable(),
  radius_km: z.coerce.number().positive(),
  shopping_day: z.coerce.number().int().min(1).max(7),
  max_stores: z.coerce.number().int().min(1).max(4),
  primary_store_id: z.string().uuid().nullable(),
  default_budget: z.coerce.number().positive(),
  budget_type: z.enum(["loft", "mål"]),
  guest_portion_kcal: z.coerce.number().positive(),
  max_prep_weekday_min: z.coerce.number().int().positive(),
  dislikes: z.string(),
  allergies: z.string(),
  morgenmad_share: z.coerce.number().min(0).max(1),
  frokost_share: z.coerce.number().min(0).max(1),
  aftensmad_share: z.coerce.number().min(0).max(1),
  snack_share: z.coerce.number().min(0).max(1),
});

function toList(value: string) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveSettings(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = settingsSchema.safeParse({
    lat: raw.lat || null,
    lng: raw.lng || null,
    radius_km: raw.radius_km,
    shopping_day: raw.shopping_day,
    max_stores: raw.max_stores,
    primary_store_id: raw.primary_store_id || null,
    default_budget: raw.default_budget,
    budget_type: raw.budget_type,
    guest_portion_kcal: raw.guest_portion_kcal,
    max_prep_weekday_min: raw.max_prep_weekday_min,
    dislikes: raw.dislikes ?? "",
    allergies: raw.allergies ?? "",
    morgenmad_share: raw.morgenmad_share,
    frokost_share: raw.frokost_share,
    aftensmad_share: raw.aftensmad_share,
    snack_share: raw.snack_share,
  });

  if (!parsed.success) {
    return { error: "Tjek felterne: " + parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const grid: Record<string, Record<string, boolean>> = {};
  for (const day of DAYS) {
    grid[day] = {};
    for (const meal of MEAL_TYPES) {
      grid[day][meal] = formData.get(`grid.${day}.${meal}`) === "on";
    }
  }

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert({
    id: true,
    lat: d.lat,
    lng: d.lng,
    radius_km: d.radius_km,
    shopping_day: d.shopping_day,
    max_stores: d.max_stores,
    primary_store_id: d.primary_store_id,
    default_budget: d.default_budget,
    budget_type: d.budget_type,
    guest_portion_kcal: d.guest_portion_kcal,
    max_prep_weekday_min: d.max_prep_weekday_min,
    dislikes: toList(d.dislikes),
    allergies: toList(d.allergies),
    default_meal_grid: grid,
    meal_shares: {
      morgenmad: d.morgenmad_share,
      frokost: d.frokost_share,
      aftensmad: d.aftensmad_share,
      snack: d.snack_share,
    },
  });

  if (error) {
    return { error: "Kunne ikke gemme indstillinger: " + error.message };
  }

  revalidatePath("/indstillinger");
  return { ok: true };
}

const personSchema = z.object({
  name: z.string().min(1),
  kcal: z.coerce.number().positive(),
  protein_g: z.coerce.number().nonnegative(),
  carbs_g: z.coerce.number().nonnegative(),
  fat_g: z.coerce.number().nonnegative(),
});

export async function savePerson(id: string | null, formData: FormData) {
  const parsed = personSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: "Tjek personens felter: " + parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("people").update(parsed.data).eq("id", id)
    : await supabase.from("people").insert(parsed.data);

  if (error) {
    return { error: "Kunne ikke gemme personen: " + error.message };
  }

  revalidatePath("/indstillinger");
  return { ok: true };
}

export async function deletePerson(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("people").delete().eq("id", id);
  if (error) {
    return { error: "Kunne ikke slette personen: " + error.message };
  }
  revalidatePath("/indstillinger");
  return { ok: true };
}

export async function toggleStore(id: string, enabled: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("stores").update({ enabled }).eq("id", id);
  if (error) {
    return { error: "Kunne ikke opdatere butikken: " + error.message };
  }
  revalidatePath("/indstillinger");
  return { ok: true };
}
