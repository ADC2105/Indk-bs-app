import type { SupabaseClient } from "@supabase/supabase-js";
import { computeUnitPrice } from "@/lib/calc/unitPrice";
import type { MacroMode } from "./types";

export type GatheredPerson = {
  id: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  macroMode: MacroMode;
};

export type GatheredOffer = {
  id: string;
  name: string;
  storeId: string;
  storeName: string;
  packCount: number | null;
  packSize: number | null;
  packUnit: string | null;
  price: number | null;
  kiloPris: number | null;
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  pricePer100gProtein: number | null;
  wanted: boolean | null;
};

export type GatheredPantryItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  useSoon: boolean;
  isStaple: boolean;
};

export type PlanInput = {
  people: GatheredPerson[];
  settings: {
    guestPortionKcal: number;
    maxPrepWeekdayMin: number;
    dislikes: string[];
    allergies: string[];
    mealShares: Record<string, number>;
    tolerances: Record<string, number>;
  };
  offers: GatheredOffer[];
  pantry: GatheredPantryItem[];
  staples: string[];
  recentRecipeTitles: string[];
  favoriteRecipeTitles: string[];
  wishes: string;
};

export async function gatherPlanInput(
  supabase: SupabaseClient,
  macroModes: Record<string, MacroMode>,
  wishes: string,
): Promise<PlanInput> {
  const [{ data: people }, { data: settings }, { data: offers }, { data: pantry }, { data: recentPlans }, { data: favorites }] =
    await Promise.all([
      supabase.from("people").select("*"),
      supabase.from("settings").select("*").eq("id", true).maybeSingle(),
      supabase
        .from("offers")
        .select("id, heading, ingredient_name, store_id, pack_count, pack_size, pack_unit, total_price, wanted, stores(name)")
        .eq("is_food", true)
        .not("wanted", "eq", false),
      supabase
        .from("pantry_items")
        .select("id, name, quantity, unit, use_soon, is_staple")
        .order("use_soon", { ascending: false }),
      supabase
        .from("planned_meals")
        .select("recipe_id, recipes(title)")
        .gte("date", new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10)),
      supabase.from("recipes").select("title").or("favorite.eq.true,rating.eq.1"),
    ]);

  const ingredientNames = Array.from(
    new Set((offers ?? []).map((o) => (o.ingredient_name ?? "").toLowerCase()).filter(Boolean)),
  );
  const { data: foodMap } =
    ingredientNames.length > 0
      ? await supabase
          .from("ingredient_food_map")
          .select("ingredient_name, foods(kcal, protein)")
          .in("ingredient_name", ingredientNames)
      : { data: [] };

  const nutritionByName = new Map<string, { kcal: number; protein: number }>();
  for (const row of foodMap ?? []) {
    const food = row.foods as unknown as { kcal: number; protein: number } | null;
    if (food) nutritionByName.set(row.ingredient_name, food);
  }

  const gatheredOffers: GatheredOffer[] = (offers ?? [])
    .filter((o) => o.pack_count && o.pack_size && o.pack_unit && o.total_price)
    .map((o) => {
      const unitPrice = computeUnitPrice({
        packCount: o.pack_count!,
        packSize: o.pack_size!,
        packUnit: o.pack_unit as "g" | "ml" | "stk",
        totalPrice: o.total_price!,
      });
      const nutrition = o.ingredient_name ? nutritionByName.get(o.ingredient_name.toLowerCase()) : undefined;
      const pricePer100gProtein =
        nutrition && nutrition.protein > 0 && unitPrice.kiloPris != null
          ? (unitPrice.kiloPris / 1000) * (100 / nutrition.protein) * 100
          : null;

      return {
        id: o.id,
        name: o.ingredient_name ?? o.heading,
        storeId: o.store_id,
        storeName: (o.stores as unknown as { name: string } | null)?.name ?? "",
        packCount: o.pack_count,
        packSize: o.pack_size,
        packUnit: o.pack_unit,
        price: o.total_price,
        kiloPris: unitPrice.kiloPris,
        kcalPer100g: nutrition?.kcal ?? null,
        proteinPer100g: nutrition?.protein ?? null,
        pricePer100gProtein,
        wanted: o.wanted,
      };
    });

  // Begræns antallet af tilbud i planlægningsprompten - en fuld ugehentning
  // kan nemt give flere hundrede, hvilket gjorde Claude-kaldet langsomt nok
  // til at risikere Vercels tidsgrænse. "Skal med"-tilbud bevares altid.
  const MAX_OFFERS_IN_PROMPT = 150;
  gatheredOffers.sort((a, b) => {
    if (a.wanted !== b.wanted) return a.wanted ? -1 : 1;
    const aPrice = a.pricePer100gProtein ?? Infinity;
    const bPrice = b.pricePer100gProtein ?? Infinity;
    return aPrice - bPrice;
  });
  const limitedOffers = gatheredOffers.slice(0, MAX_OFFERS_IN_PROMPT);

  const pantryItems = (pantry ?? []).filter((p) => !p.is_staple);
  const staples = (pantry ?? []).filter((p) => p.is_staple).map((p) => p.name);

  const recentRecipeTitles = Array.from(
    new Set(
      (recentPlans ?? [])
        .map((p) => (p.recipes as unknown as { title: string } | null)?.title)
        .filter((t): t is string => !!t),
    ),
  );
  const favoriteRecipeTitles = (favorites ?? []).map((f) => f.title);

  return {
    people: (people ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      kcal: p.kcal,
      protein_g: p.protein_g,
      carbs_g: p.carbs_g,
      fat_g: p.fat_g,
      macroMode: macroModes[p.id] ?? "fri",
    })),
    settings: {
      guestPortionKcal: settings?.guest_portion_kcal ?? 700,
      maxPrepWeekdayMin: settings?.max_prep_weekday_min ?? 30,
      dislikes: settings?.dislikes ?? [],
      allergies: settings?.allergies ?? [],
      mealShares: settings?.meal_shares ?? {},
      tolerances: settings?.tolerances ?? {},
    },
    offers: limitedOffers,
    pantry: pantryItems.map((p) => ({
      id: p.id,
      name: p.name,
      quantity: p.quantity,
      unit: p.unit,
      useSoon: p.use_soon,
      isStaple: false,
    })),
    staples,
    recentRecipeTitles,
    favoriteRecipeTitles,
    wishes,
  };
}

/** Kompakt tekstformat til planlægningsprompten (SPEC.md: "én linje pr. tilbud"). */
export function formatOffersCompact(offers: GatheredOffer[]): string {
  return offers
    .map((o) => {
      const parts = [
        o.id,
        o.name,
        o.storeName,
        `${o.packCount}x${o.packSize}${o.packUnit}`,
        `${o.price}kr`,
        o.kiloPris ? `${o.kiloPris.toFixed(0)}kr/kg` : "",
        o.kcalPer100g != null ? `${o.kcalPer100g.toFixed(0)}kcal/100g` : "",
        o.proteinPer100g != null ? `${o.proteinPer100g.toFixed(1)}gprotein/100g` : "",
        o.pricePer100gProtein != null ? `${o.pricePer100gProtein.toFixed(1)}kr/100gprotein` : "",
        o.wanted ? "SKAL_MED" : "",
      ];
      return parts.filter(Boolean).join(" | ");
    })
    .join("\n");
}

export function formatPantryCompact(input: PlanInput): string {
  const pantryLines = input.pantry
    .map((p) => `${p.id} | ${p.name}${p.quantity ? ` ${p.quantity}${p.unit ?? ""}` : ""}${p.useSoon ? " | BRUG_SNART" : ""}`)
    .join("\n");
  const staplesLine = input.staples.join(", ");
  return `Beholdning:\n${pantryLines || "(tom)"}\n\nBasisvarer (altid på lager): ${staplesLine || "(ingen)"}`;
}
