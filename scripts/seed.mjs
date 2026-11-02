// Seed-script: fire butikker, to eksempelpersoner, husstandsindstillinger,
// en lille beholdning, et sæt eksempeltilbud og en prisliste på ca. 90 varer.
// Alt er testdata, så appen kan afprøves uden Tjek og uden at kende rigtige priser.
//
// Kør med:  node --env-file=.env.local scripts/seed.mjs
import { createClient } from "@supabase/supabase-js";
import { priceListSeed } from "./priceListSeed.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i miljøet.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function upsertStores() {
  const names = ["Lidl", "Netto", "Rema 1000", "Kvickly"];
  const { error } = await supabase
    .from("stores")
    .upsert(
      names.map((name) => ({ name, enabled: true })),
      { onConflict: "name", ignoreDuplicates: true },
    )
    .select();
  if (error) throw new Error("stores: " + error.message);

  const { data: all, error: fetchError } = await supabase.from("stores").select("id, name");
  if (fetchError) throw new Error("stores (hent): " + fetchError.message);
  console.log(`✓ Butikker: ${all.map((s) => s.name).join(", ")}`);
  return all;
}

async function seedPeople() {
  const { count } = await supabase.from("people").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    console.log("· Springer over: people har allerede data");
    return;
  }
  const { error } = await supabase.from("people").insert([
    { name: "Person A", kcal: 2200, protein_g: 150, carbs_g: 220, fat_g: 70 },
    { name: "Person B", kcal: 1800, protein_g: 120, carbs_g: 180, fat_g: 60 },
  ]);
  if (error) throw new Error("people: " + error.message);
  console.log("✓ To eksempelpersoner oprettet (ret navne og mål i Indstillinger)");
}

async function seedSettings(stores) {
  const rema = stores.find((s) => s.name === "Rema 1000");
  const { error } = await supabase.from("settings").upsert({
    id: true,
    lat: 55.7092,
    lng: 9.5363,
    radius_km: 10,
    shopping_day: 6,
    max_stores: 2,
    primary_store_id: rema?.id ?? null,
    default_budget: 700,
    budget_type: "mål",
    default_meal_grid: {
      mon: { morgenmad: false, frokost: false, aftensmad: true, snack: false },
      tue: { morgenmad: false, frokost: false, aftensmad: true, snack: false },
      wed: { morgenmad: false, frokost: false, aftensmad: true, snack: false },
      thu: { morgenmad: false, frokost: false, aftensmad: true, snack: false },
      fri: { morgenmad: false, frokost: false, aftensmad: true, snack: false },
      sat: { morgenmad: false, frokost: false, aftensmad: true, snack: false },
      sun: { morgenmad: false, frokost: false, aftensmad: true, snack: false },
    },
    meal_shares: { morgenmad: 0.2, frokost: 0.3, aftensmad: 0.35, snack: 0.15 },
    guest_portion_kcal: 700,
    max_prep_weekday_min: 30,
    dislikes: [],
    allergies: [],
  });
  if (error) throw new Error("settings: " + error.message);
  console.log("✓ Husstandsindstillinger sat (postnr. 7100 Vejle, fem aftensmåltider som standard)");
}

async function seedPantry() {
  const { count } = await supabase.from("pantry_items").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    console.log("· Springer over: pantry_items har allerede data");
    return;
  }
  // PostgREST bruger NULL (ikke kolonnens standardværdi) for felter, der mangler
  // på en enkelt række i et bulk-insert, hvis andre rækker har feltet sat.
  // Derfor sætter vi alle felter eksplicit på hver række herunder.
  const base = { quantity: null, unit: null, use_soon: false, is_staple: false };
  const { error } = await supabase.from("pantry_items").insert([
    { ...base, name: "Pasta", quantity: 500, unit: "g", location: "skab" },
    { ...base, name: "Kartofler", quantity: 2, unit: "kg", location: "skab" },
    { ...base, name: "Hakket oksekød", quantity: 400, unit: "g", location: "fryser", use_soon: true },
    { ...base, name: "Mælk", quantity: 1, unit: "l", location: "køleskab" },
    { ...base, name: "Æg", quantity: 6, unit: "stk", location: "køleskab" },
    { ...base, name: "Spidskål", quantity: 1, unit: "stk", location: "køleskab", use_soon: true },
    { ...base, name: "Salt", location: "skab", is_staple: true },
    { ...base, name: "Peber", location: "skab", is_staple: true },
    { ...base, name: "Olivenolie", location: "skab", is_staple: true },
  ]);
  if (error) throw new Error("pantry_items: " + error.message);
  console.log("✓ Lille eksempelbeholdning oprettet");
}

async function seedOffers(stores) {
  const { count } = await supabase.from("offers").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    console.log("· Springer over: offers har allerede data");
    return;
  }
  const byName = Object.fromEntries(stores.map((s) => [s.name, s.id]));
  const today = new Date();
  const validFrom = today.toISOString().slice(0, 10);
  const until = new Date(today.getTime() + 6 * 86400000).toISOString().slice(0, 10);

  const sampleOffers = [
    ["Lidl", "Hakket oksekød 8-12%", 25, "400 g", "kød", "hakket oksekød 8-12%", 1, 400, "g", 25],
    ["Lidl", "Kyllingebryst", 40, "500 g", "kød", "kyllingebryst", 1, 500, "g", 40],
    ["Netto", "Laksefilet", 45, "300 g", "fisk", "laksefilet", 1, 300, "g", 45],
    ["Netto", "Æbler", 15, "1 kg", "frugt_grønt", "æbler", 1, 1000, "g", 15],
    ["Rema 1000", "Hakket svinekød 8-12%", 20, "400 g", "kød", "hakket svinekød 8-12%", 1, 400, "g", 20],
    ["Rema 1000", "Ris", 15, "1 kg", "kolonial", "ris", 1, 1000, "g", 15],
    ["Kvickly", "Revet ost 28%", 25, "400 g", "mejeri_æg", "revet ost 28%", 1, 400, "g", 25],
    ["Kvickly", "Broccoli", 10, "1 stk", "frugt_grønt", "broccoli", 1, 1, "stk", 10],
  ];

  const rows = sampleOffers.map(
    ([storeName, heading, price, quantityText, category, ingredientName, packCount, packSize, packUnit, totalPrice], i) => ({
      store_id: byName[storeName],
      source: "manual",
      external_id: `seed-${i}`,
      heading,
      price,
      quantity_text: quantityText,
      valid_from: validFrom,
      valid_until: until,
      is_food: true,
      category,
      ingredient_name: ingredientName,
      pack_count: packCount,
      pack_size: packSize,
      pack_unit: packUnit,
      total_price: totalPrice,
      needs_review: false,
    }),
  );

  const { error } = await supabase.from("offers").insert(rows);
  if (error) throw new Error("offers: " + error.message);
  console.log(`✓ ${rows.length} eksempeltilbud oprettet (til test uden Tjek)`);
}

async function seedPriceList() {
  const { count } = await supabase.from("price_list").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    console.log("· Springer over: price_list har allerede data");
    return;
  }
  const { error } = await supabase.from("price_list").insert(priceListSeed);
  if (error) throw new Error("price_list: " + error.message);
  console.log(`✓ Prisliste med ${priceListSeed.length} varer oprettet (alle estimerede)`);
}

async function main() {
  const stores = await upsertStores();
  await seedPeople();
  await seedSettings(stores);
  await seedPantry();
  await seedOffers(stores);
  await seedPriceList();
  console.log("\nFærdig.");
}

main().catch((err) => {
  console.error("Seed fejlede:", err.message);
  process.exit(1);
});
