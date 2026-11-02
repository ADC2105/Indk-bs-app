import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaudeTool } from "./client";
import { OFFER_NORMALIZE_PROMPT } from "./prompts/tilbudNormaliser";

const BATCH_SIZE = 50;

const CATEGORIES = [
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
] as const;

const normalizedOfferSchema = z.object({
  id: z.string(),
  is_food: z.boolean(),
  category: z.enum(CATEGORIES).nullable(),
  ingredient_name: z.string().nullable(),
  pack_count: z.number().nullable(),
  pack_size: z.number().nullable(),
  pack_unit: z.enum(["g", "ml", "stk"]).nullable(),
  total_price: z.number().nullable(),
  min_purchase: z.number().int().nullable(),
  conditions: z.string().nullable(),
  usikker: z.boolean(),
});

export type NormalizedOffer = z.infer<typeof normalizedOfferSchema>;

const batchResultSchema = z.object({ tilbud: z.array(normalizedOfferSchema) });

const inputSchema = {
  type: "object" as const,
  properties: {
    tilbud: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          is_food: { type: "boolean" },
          category: { type: ["string", "null"], enum: [...CATEGORIES, null] },
          ingredient_name: { type: ["string", "null"] },
          pack_count: { type: ["number", "null"] },
          pack_size: { type: ["number", "null"] },
          pack_unit: { type: ["string", "null"], enum: ["g", "ml", "stk", null] },
          total_price: { type: ["number", "null"] },
          min_purchase: { type: ["integer", "null"] },
          conditions: { type: ["string", "null"] },
          usikker: { type: "boolean" },
        },
        required: [
          "id",
          "is_food",
          "category",
          "ingredient_name",
          "pack_count",
          "pack_size",
          "pack_unit",
          "total_price",
          "min_purchase",
          "conditions",
          "usikker",
        ],
      },
    },
  },
  required: ["tilbud"],
};

export type OfferToNormalize = {
  id: string;
  heading: string;
  description: string | null;
  price: number | null;
  quantityText: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Normaliserer tilbud i portioner af ca. 50 ad gangen med CLAUDE_MODEL_FAST. */
export async function normalizeOffers(
  supabase: SupabaseClient,
  offers: OfferToNormalize[],
): Promise<NormalizedOffer[]> {
  const results: NormalizedOffer[] = [];

  for (const batch of chunk(offers, BATCH_SIZE)) {
    const userMessage = JSON.stringify(
      batch.map((o) => ({
        id: o.id,
        heading: o.heading,
        description: o.description,
        price: o.price,
        quantity_text: o.quantityText,
      })),
    );

    const result = await callClaudeTool({
      supabase,
      purpose: "tilbud_normalisering",
      model: process.env.CLAUDE_MODEL_FAST!,
      system: OFFER_NORMALIZE_PROMPT,
      userMessage,
      toolName: "gem_tilbud",
      toolDescription: "Gem de normaliserede tilbud",
      inputSchema,
      zodSchema: batchResultSchema,
    });

    results.push(...result.tilbud);
  }

  return results;
}
