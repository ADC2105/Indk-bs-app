import type { SupabaseClient } from "@supabase/supabase-js";
import { matchIngredientToFood } from "@/lib/foods/matchIngredient";
import { estimatePrice } from "@/lib/ai/priceEstimate";
import { computeUnitPrice, packsNeeded, packCost } from "@/lib/calc/unitPrice";
import { enumerateStoreCombos, cheapestCombo, type ItemOption } from "@/lib/calc/storeCombos";
import type { PlannerMeal } from "@/lib/ai/planGenerate";

export type ResolvedIngredient = {
  mealIndex: number;
  name: string;
  gramsRaw: number;
  source: "offer" | "pantry" | "staple" | "buy";
  offerId: string | null;
  pantryItemId: string | null;
  foodId: string | null;
  costDkk: number;
};

type OfferRow = {
  id: string;
  store_id: string;
  pack_count: number | null;
  pack_size: number | null;
  pack_unit: "g" | "ml" | "stk" | null;
  total_price: number | null;
};

type PriceListRow = { name: string; price: number; pack_size: number | null; pack_unit: string | null; store_id: string | null };

export async function resolveIngredients(
  supabase: SupabaseClient,
  meals: PlannerMeal[],
  maxStores: number,
  enabledStoreIds: string[],
  primaryStoreId: string | null,
): Promise<{ resolved: ResolvedIngredient[]; storeIds: string[]; warnings: string[] }> {
  const warnings: string[] = [];

  // 1. Match hver unik ingrediens til en fødevare (næringsdata), cachet.
  // Kørt parallelt (ikke sekventielt) - det er AI-kald mod Anthropic, ikke
  // mod Tjek, så den høflige pause fra lib/offers/tjekSource.ts gælder ikke
  // her, og sekventielt ville nemt ramme Vercels tidsgrænse for en hel uges
  // ingredienser.
  const uniqueNames = Array.from(new Set(meals.flatMap((m) => m.ingredients.map((i) => i.name.toLowerCase()))));
  const foodIdByName = new Map<string, string | null>();
  await Promise.all(
    uniqueNames.map(async (name) => {
      try {
        foodIdByName.set(name, await matchIngredientToFood(supabase, name));
      } catch {
        foodIdByName.set(name, null);
      }
    }),
  );

  // 2. Hent de offers, der refereres til.
  const offerIds = Array.from(
    new Set(meals.flatMap((m) => m.ingredients.filter((i) => i.source === "offer" && i.offer_id).map((i) => i.offer_id!))),
  );
  const { data: offerRows } =
    offerIds.length > 0
      ? await supabase
          .from("offers")
          .select("id, store_id, pack_count, pack_size, pack_unit, total_price")
          .in("id", offerIds)
      : { data: [] as OfferRow[] };
  const offersById = new Map((offerRows ?? []).map((o) => [o.id, o as OfferRow]));

  // 3. Aggreger gram-behov pr. gruppe: offer-id for tilbud, ingrediensnavn for køb.
  type Group = { kind: "offer"; offerId: string } | { kind: "buy"; name: string };
  const groupKey = (g: Group) => (g.kind === "offer" ? "offer:" + g.offerId : "buy:" + g.name);
  const gramsByGroup = new Map<string, number>();

  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      if (ing.source === "offer" && ing.offer_id && offersById.has(ing.offer_id)) {
        const key = groupKey({ kind: "offer", offerId: ing.offer_id });
        gramsByGroup.set(key, (gramsByGroup.get(key) ?? 0) + ing.grams_raw);
      } else if (ing.source === "buy") {
        const key = groupKey({ kind: "buy", name: ing.name.toLowerCase() });
        gramsByGroup.set(key, (gramsByGroup.get(key) ?? 0) + ing.grams_raw);
      }
    }
  }

  // 4. Find pris-kilde pr. gruppe: tilbud direkte, ellers prisliste, ellers AI-estimat.
  const buyNames = Array.from(gramsByGroup.keys())
    .filter((k) => k.startsWith("buy:"))
    .map((k) => k.slice(4));
  const { data: priceListRows } =
    buyNames.length > 0
      ? await supabase.from("price_list").select("name, price, pack_size, pack_unit, store_id").in("name", buyNames)
      : { data: [] as PriceListRow[] };
  const priceListByName = new Map((priceListRows ?? []).map((p) => [p.name.toLowerCase(), p as PriceListRow]));

  const itemOptionByGroup = new Map<string, ItemOption>();
  const packInfoByGroup = new Map<string, { packs: number; costPerGroup: number }>();

  // Varer uden tilbud og uden prisliste skal AI-estimeres. Gøres parallelt
  // (samme begrundelse som fødevare-matchingen ovenfor).
  const needsEstimate = Array.from(gramsByGroup.keys()).filter(
    (key) => key.startsWith("buy:") && !priceListByName.has(key.slice(4)),
  );
  const estimatedPriceByName = new Map<string, number>();
  await Promise.all(
    needsEstimate.map(async (key) => {
      const name = key.slice(4);
      try {
        const price = await estimatePrice(supabase, name, null, null);
        estimatedPriceByName.set(name, price);
        await supabase.from("price_list").insert({ name, price, is_estimate: true });
      } catch {
        warnings.push(`Kunne ikke finde eller estimere en pris for "${name}".`);
      }
    }),
  );

  for (const [key, grams] of gramsByGroup) {
    if (key.startsWith("offer:")) {
      const offerId = key.slice(6);
      const offer = offersById.get(offerId)!;
      if (!offer.pack_count || !offer.pack_size || !offer.pack_unit || !offer.total_price) {
        warnings.push(`Tilbud ${offerId} mangler pakkeinfo og kunne ikke prissættes.`);
        continue;
      }
      const totalPackSize = offer.pack_count * offer.pack_size;
      const packs = packsNeeded(grams, totalPackSize);
      const cost = packCost(packs, offer.total_price);
      itemOptionByGroup.set(key, { sources: [{ storeId: offer.store_id, packs, packPrice: offer.total_price, isEstimate: false }] });
      packInfoByGroup.set(key, { packs, costPerGroup: cost });
      continue;
    }

    const name = key.slice(4);
    const priceListEntry = priceListByName.get(name);
    if (priceListEntry) {
      const packSize = priceListEntry.pack_size ?? 500;
      const packs = packsNeeded(grams, packSize);
      const cost = packCost(packs, priceListEntry.price);
      const storeId = priceListEntry.store_id ?? primaryStoreId;
      itemOptionByGroup.set(key, {
        sources: [{ storeId: storeId ?? null, packs, packPrice: priceListEntry.price, isEstimate: priceListEntry.price === 0 }],
      });
      packInfoByGroup.set(key, { packs, costPerGroup: cost });
      continue;
    }

    const estimatedPrice = estimatedPriceByName.get(name);
    if (estimatedPrice != null) {
      itemOptionByGroup.set(key, {
        sources: [{ storeId: primaryStoreId, packs: 1, packPrice: estimatedPrice, isEstimate: true }],
      });
      packInfoByGroup.set(key, { packs: 1, costPerGroup: estimatedPrice });
    }
  }

  // 5. Vælg billigste butikskombination, der dækker alle tilbud/køb.
  const items = Array.from(itemOptionByGroup.values());
  const combos = enumerateStoreCombos(enabledStoreIds, maxStores);
  let best = cheapestCombo(combos, items);
  if (!best && items.length > 0) {
    warnings.push(`Tilbud og indkøb spreder sig over flere end ${maxStores} butik(ker) - brugte alle aktive butikker.`);
    best = cheapestCombo(enumerateStoreCombos(enabledStoreIds, enabledStoreIds.length), items);
  }
  const storeIds = best?.storeIds ?? enabledStoreIds;

  // 6. Fordel kost forholdsmæssigt ud på de enkelte ingredienslinjer (til visning).
  const resolved: ResolvedIngredient[] = [];
  meals.forEach((meal, mealIndex) => {
    for (const ing of meal.ingredients) {
      const foodId = foodIdByName.get(ing.name.toLowerCase()) ?? null;
      let costDkk = 0;

      if (ing.source === "offer" && ing.offer_id && offersById.has(ing.offer_id)) {
        const key = groupKey({ kind: "offer", offerId: ing.offer_id });
        const info = packInfoByGroup.get(key);
        const totalGrams = gramsByGroup.get(key) ?? ing.grams_raw;
        if (info) costDkk = (info.costPerGroup * ing.grams_raw) / totalGrams;
      } else if (ing.source === "buy") {
        const key = groupKey({ kind: "buy", name: ing.name.toLowerCase() });
        const info = packInfoByGroup.get(key);
        const totalGrams = gramsByGroup.get(key) ?? ing.grams_raw;
        if (info) costDkk = (info.costPerGroup * ing.grams_raw) / totalGrams;
      }

      resolved.push({
        mealIndex,
        name: ing.name,
        gramsRaw: ing.grams_raw,
        source: ing.source,
        offerId: ing.offer_id ?? null,
        pantryItemId: ing.pantry_item_id ?? null,
        foodId,
        costDkk,
      });
    }
  });

  return { resolved, storeIds, warnings };
}

export { computeUnitPrice };
