"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { findDealerId, tjekSource } from "@/lib/offers/tjekSource";
import { nextShoppingDate, todayInCopenhagen } from "@/lib/offers/shoppingDate";
import { normalizeOffers, type OfferToNormalize } from "@/lib/ai/offerNormalize";
import { extractOffersFromImages, extractOffersFromText } from "@/lib/ai/offerExtract";

async function resolveDealerIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stores: { id: string; name: string; tjek_dealer_id: string | null }[],
) {
  const resolved = [...stores];
  for (const store of resolved) {
    if (store.tjek_dealer_id) continue;
    const dealerId = await findDealerId(store.name);
    if (dealerId) {
      store.tjek_dealer_id = dealerId;
      await supabase.from("stores").update({ tjek_dealer_id: dealerId }).eq("id", store.id);
    }
  }
  return resolved;
}

const NORMALIZE_BATCH_SIZE = 50;

/**
 * Normaliserer op til 50 endnu-ikke-normaliserede tilbud (ét Claude-kald) og
 * returnerer, hvor mange der stadig mangler. Hentning og normalisering er
 * bevidst delt op i små trin, så hvert serverkald er hurtigt nok til at nå
 * at blive færdigt inden for Vercels tidsgrænse - klienten kalder denne
 * funktion i et loop, indtil "remaining" er 0, med en statusvisning imellem.
 */
export async function normalizeNextBatch(): Promise<
  { remaining: number; error?: undefined } | { error: string; remaining?: undefined }
> {
  const supabase = await createClient();

  const { data: toNormalize, error: fetchError } = await supabase
    .from("offers")
    .select("id, heading, price, quantity_text, raw")
    .is("ingredient_name", null)
    .limit(NORMALIZE_BATCH_SIZE);

  if (fetchError) {
    return { error: "Kunne ikke hente tilbud til normalisering: " + fetchError.message };
  }
  if (!toNormalize || toNormalize.length === 0) {
    return { remaining: 0 };
  }

  const input: OfferToNormalize[] = toNormalize.map((o) => ({
    id: o.id,
    heading: o.heading,
    description: (o.raw as { description?: string } | null)?.description ?? null,
    price: o.price,
    quantityText: o.quantity_text,
  }));

  let normalized;
  try {
    normalized = await normalizeOffers(supabase, input);
  } catch (err) {
    return { error: "Normalisering fejlede: " + (err instanceof Error ? err.message : "ukendt fejl") };
  }

  for (const n of normalized) {
    await supabase
      .from("offers")
      .update({
        is_food: n.is_food,
        category: n.category,
        ingredient_name: n.ingredient_name,
        pack_count: n.pack_count,
        pack_size: n.pack_size,
        pack_unit: n.pack_unit,
        total_price: n.total_price,
        min_purchase: n.min_purchase,
        conditions: n.conditions,
        needs_review: n.usikker,
      })
      .eq("id", n.id);
  }

  const { count } = await supabase
    .from("offers")
    .select("id", { count: "exact", head: true })
    .is("ingredient_name", null);

  revalidatePath("/tilbud");
  return { remaining: count ?? 0 };
}

export async function fetchOffersFromTjek() {
  const supabase = await createClient();

  const { data: settings } = await supabase.from("settings").select("*").eq("id", true).maybeSingle();
  if (!settings?.lat || !settings?.lng) {
    return { error: "Mangler breddegrad/længdegrad. Sæt dem under Indstillinger først." };
  }

  const { data: lastFetch } = await supabase
    .from("offers")
    .select("fetched_at")
    .eq("source", "tjek")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const today = todayInCopenhagen();
  if (lastFetch?.fetched_at) {
    const lastDate = new Date(lastFetch.fetched_at);
    const lastDateCopenhagen = new Date(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(lastDate),
    );
    if (lastDateCopenhagen.getTime() === today.getTime()) {
      return { error: "Tilbud er allerede hentet i dag. Prøv igen i morgen, eller brug manuel import." };
    }
  }

  const { data: storesData } = await supabase.from("stores").select("*").eq("enabled", true);
  const stores = storesData ?? [];
  if (stores.length === 0) {
    return { error: "Ingen butikker er aktive. Slå mindst én butik til under Indstillinger." };
  }

  let resolvedStores;
  try {
    resolvedStores = await resolveDealerIds(supabase, stores);
  } catch (err) {
    return {
      error:
        "Kunne ikke slå butikkernes id'er op hos Tjek. " +
        (err instanceof Error ? err.message : "Ukendt fejl") +
        " Brug manuel import i stedet.",
    };
  }

  const shoppingDate = nextShoppingDate(settings.shopping_day ?? 6, today);

  let rawOffers;
  try {
    rawOffers = await tjekSource.fetchOffers({
      lat: settings.lat,
      lng: settings.lng,
      radiusKm: settings.radius_km ?? 10,
      stores: resolvedStores.map((s) => ({ id: s.id, name: s.name, tjekDealerId: s.tjek_dealer_id })),
      shoppingDate,
    });
  } catch (err) {
    return {
      error:
        "Tjek svarede ikke som forventet. " +
        (err instanceof Error ? err.message : "Ukendt fejl") +
        " Brug manuel import i stedet.",
    };
  }

  if (rawOffers.length === 0) {
    return { error: "Fandt ingen dagligvaretilbud for de valgte butikker lige nu. Prøv manuel import." };
  }

  const now = new Date().toISOString();
  const upsertRows = rawOffers.map((o) => ({
    store_id: o.storeId,
    source: o.source,
    external_id: o.externalId,
    raw: o.raw,
    heading: o.heading,
    price: o.price,
    quantity_text: o.quantityText,
    valid_from: o.validFrom,
    valid_until: o.validUntil,
    image_url: o.imageUrl,
    fetched_at: now,
  }));

  const { error } = await supabase.from("offers").upsert(upsertRows, { onConflict: "store_id,external_id" });

  if (error) {
    return { error: "Kunne ikke gemme tilbuddene: " + error.message };
  }

  revalidatePath("/tilbud");
  return { ok: true, count: rawOffers.length };
}

const manualTextSchema = z.string().min(1);

function rowsFromExtracted(
  extracted: Awaited<ReturnType<typeof extractOffersFromText>>,
  storeId: string,
) {
  const now = new Date().toISOString();
  return extracted.map((o, i) => ({
    store_id: storeId,
    source: "manual" as const,
    external_id: `manual-${Date.now()}-${i}`,
    heading: o.heading,
    price: o.total_price,
    quantity_text: o.quantityText,
    fetched_at: now,
    is_food: o.is_food,
    category: o.category,
    ingredient_name: o.ingredient_name,
    pack_count: o.pack_count,
    pack_size: o.pack_size,
    pack_unit: o.pack_unit,
    total_price: o.total_price,
    needs_review: o.usikker,
  }));
}

export async function importOffersFromText(text: string, storeId: string) {
  const parsed = manualTextSchema.safeParse(text);
  if (!parsed.success || !storeId) {
    return { error: "Indsæt tekst og vælg en butik først." };
  }

  const supabase = await createClient();

  try {
    const extracted = await extractOffersFromText(supabase, parsed.data);
    if (extracted.length === 0) {
      return { error: "Fandt ingen tilbud i teksten. Prøv at indsætte mere af avisen." };
    }

    const rows = rowsFromExtracted(extracted, storeId);
    const { error } = await supabase.from("offers").insert(rows);
    if (error) {
      return { error: "Kunne ikke gemme tilbuddene: " + error.message };
    }

    revalidatePath("/tilbud");
    return { ok: true, count: rows.length };
  } catch (err) {
    return { error: "Kunne ikke tolke teksten: " + (err instanceof Error ? err.message : "ukendt fejl") };
  }
}

export async function importOffersFromImages(
  images: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" }[],
  storeId: string,
) {
  if (images.length === 0 || !storeId) {
    return { error: "Vælg mindst ét billede og en butik først." };
  }

  const supabase = await createClient();

  try {
    const extracted = await extractOffersFromImages(supabase, images);
    if (extracted.length === 0) {
      return { error: "Fandt ingen tilbud på billedet/billederne. Prøv et tydeligere billede." };
    }

    const rows = rowsFromExtracted(extracted, storeId);
    const { error } = await supabase.from("offers").insert(rows);
    if (error) {
      return { error: "Kunne ikke gemme tilbuddene: " + error.message };
    }

    revalidatePath("/tilbud");
    return { ok: true, count: rows.length };
  } catch (err) {
    return { error: "Kunne ikke tolke billedet: " + (err instanceof Error ? err.message : "ukendt fejl") };
  }
}

const manualOfferSchema = z.object({
  store_id: z.string().uuid(),
  heading: z.string().min(1),
  ingredient_name: z.string().min(1),
  category: z.enum([
    "frugt_grønt",
    "kød",
    "fisk",
    "mejeri_æg",
    "brød",
    "kolonial",
    "frost",
    "drikke",
    "snacks",
    "andet",
  ]),
  price: z.coerce.number().positive(),
  pack_count: z.coerce.number().positive(),
  pack_size: z.coerce.number().positive(),
  pack_unit: z.enum(["g", "ml", "stk"]),
});

export async function addManualOffer(formData: FormData) {
  const parsed = manualOfferSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: "Tjek felterne: " + parsed.error.issues.map((i) => i.message).join(", ") };
  }

  const supabase = await createClient();
  const d = parsed.data;
  const { error } = await supabase.from("offers").insert({
    store_id: d.store_id,
    source: "manual",
    external_id: `manual-${Date.now()}`,
    heading: d.heading,
    price: d.price,
    total_price: d.price,
    is_food: true,
    category: d.category,
    ingredient_name: d.ingredient_name,
    pack_count: d.pack_count,
    pack_size: d.pack_size,
    pack_unit: d.pack_unit,
    needs_review: false,
  });

  if (error) {
    return { error: "Kunne ikke gemme tilbuddet: " + error.message };
  }

  revalidatePath("/tilbud");
  return { ok: true };
}

export async function setOfferWanted(id: string, wanted: boolean | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("offers").update({ wanted }).eq("id", id);
  if (error) {
    return { error: "Kunne ikke opdatere tilbuddet: " + error.message };
  }
  revalidatePath("/tilbud");
  return { ok: true };
}
