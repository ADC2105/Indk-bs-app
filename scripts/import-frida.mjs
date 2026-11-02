// Importerer DTU's fødevaredatabase (Frida/FCDB) til tabellen `foods`.
//
// Datasættet er en relationel eksport med flere ark. De relevante er:
// - Food: FoodID -> FødevareNavn (dansk navn), FoodName (engelsk)
// - Data_Normalised: langt format, én række pr. (FoodID, ParameterID) med
//   den repræsentative værdi i ResVal (g eller kcal pr. 100 g)
//
// Vi bruger disse ParameterID'er (fundet ved at inspicere Parameter-arket):
//   356 = Energi (kcal), 218 = Protein, 172 = Tilgængelig kulhydrat,
//   141 = Fedt, 168 = Kostfibre.
// "Tilgængelig kulhydrat" er valgt frem for "Kulhydrat difference", fordi det
// er det tal, danske næringsdeklarationer normalt viser (uden kostfibre).
//
// Kør med:  node --env-file=.env.local scripts/import-frida.mjs
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import { existsSync, readFileSync } from "node:fs";

const DATA_FILE = "data/FCDB_6.1_Dataset.xlsx";

const PARAMETER_IDS = {
  kcal: 356,
  protein: 218,
  carbs: 172,
  fat: 141,
  fiber: 168,
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i miljøet.");
  process.exit(1);
}

if (!existsSync(DATA_FILE)) {
  console.error(`Finder ikke ${DATA_FILE}. Læg Frida/FCDB-eksporten (.xlsx) i data/-mappen.`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

console.log("Læser", DATA_FILE, "…");
// XLSX.readFile fejler i xlsx-pakkens ESM-byg, når stien indeholder "ø"
// (Windows-sti "...Indkøbs-app\..."). Vi læser selv bytes med Node og giver
// XLSX en buffer i stedet, som ikke rammer den fejlbehæftede sti-kode.
const fileBuffer = readFileSync(DATA_FILE);
const wb = XLSX.read(fileBuffer, { type: "buffer" });

for (const required of ["Food", "Data_Normalised"]) {
  if (!wb.SheetNames.includes(required)) {
    console.error(`Forventede et ark ved navn "${required}", men fandt kun: ${wb.SheetNames.join(", ")}`);
    console.error("Formatet er sandsynligvis ændret - tjek arkene manuelt, før scriptet rettes til.");
    process.exit(1);
  }
}

const foodSheet = XLSX.utils.sheet_to_json(wb.Sheets["Food"]);
const dataSheet = XLSX.utils.sheet_to_json(wb.Sheets["Data_Normalised"]);

console.log(`Fandt ${foodSheet.length} fødevarer og ${dataSheet.length} måleværdier.`);

const namesByFoodId = new Map();
for (const row of foodSheet) {
  if (row.FoodID != null && row["FødevareNavn"]) {
    namesByFoodId.set(row.FoodID, row["FødevareNavn"]);
  }
}

const neededParamIds = new Set(Object.values(PARAMETER_IDS));
const valuesByFoodId = new Map();
for (const row of dataSheet) {
  if (!neededParamIds.has(row.ParameterID)) continue;
  const val = typeof row.ResVal === "number" ? row.ResVal : null;
  if (val == null) continue;
  const entry = valuesByFoodId.get(row.FoodID) ?? {};
  entry[row.ParameterID] = val;
  valuesByFoodId.set(row.FoodID, entry);
}

const rows = [];
let skippedMissingCore = 0;
for (const [foodId, name] of namesByFoodId) {
  const values = valuesByFoodId.get(foodId) ?? {};
  const kcal = values[PARAMETER_IDS.kcal];
  const protein = values[PARAMETER_IDS.protein];
  const carbs = values[PARAMETER_IDS.carbs];
  const fat = values[PARAMETER_IDS.fat];
  const fiber = values[PARAMETER_IDS.fiber] ?? null;

  if (kcal == null || protein == null || carbs == null || fat == null) {
    skippedMissingCore++;
    continue;
  }

  rows.push({
    frida_id: String(foodId),
    name_da: name,
    kcal,
    protein,
    carbs,
    fat,
    fiber,
    source: "frida",
  });
}

console.log(`${rows.length} fødevarer har alle fire kernenæringsstoffer og importeres.`);
if (skippedMissingCore > 0) {
  console.log(`${skippedMissingCore} fødevarer sprunget over (mangler kcal/protein/kulhydrat/fedt).`);
}

const BATCH_SIZE = 500;
let imported = 0;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const { error } = await supabase.from("foods").upsert(batch, { onConflict: "frida_id" });
  if (error) {
    console.error("Fejl ved import af batch", i / BATCH_SIZE + 1, ":", error.message);
    process.exit(1);
  }
  imported += batch.length;
  console.log(`  …${imported}/${rows.length}`);
}

console.log("\nFærdig. Importerede", imported, "fødevarer fra Frida/FCDB.");
