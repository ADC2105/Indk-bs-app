import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { callClaudeTool } from "./client";
import { OFFER_EXTRACT_PROMPT } from "./prompts/tilbudUdtraek";

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

const extractedOfferSchema = z.object({
  heading: z.string(),
  category: z.enum(CATEGORIES),
  ingredient_name: z.string(),
  pack_count: z.number().positive(),
  pack_size: z.number().positive(),
  pack_unit: z.enum(["g", "ml", "stk"]),
  total_price: z.number().positive(),
  usikker: z.boolean(),
});

export type ExtractedOffer = z.infer<typeof extractedOfferSchema>;

const resultSchema = z.object({ tilbud: z.array(extractedOfferSchema) });

const inputSchema = {
  type: "object" as const,
  properties: {
    tilbud: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          ingredient_name: { type: "string" },
          pack_count: { type: "number" },
          pack_size: { type: "number" },
          pack_unit: { type: "string", enum: ["g", "ml", "stk"] },
          total_price: { type: "number" },
          usikker: { type: "boolean" },
        },
        required: [
          "heading",
          "category",
          "ingredient_name",
          "pack_count",
          "pack_size",
          "pack_unit",
          "total_price",
          "usikker",
        ],
      },
    },
  },
  required: ["tilbud"],
};

export async function extractOffersFromText(
  supabase: SupabaseClient,
  text: string,
): Promise<(ExtractedOffer & { storeId: null; quantityText: string; is_food: true })[]> {
  const result = await callClaudeTool({
    supabase,
    purpose: "tilbud_udtraek_tekst",
    model: process.env.CLAUDE_MODEL_FAST!,
    system: OFFER_EXTRACT_PROMPT,
    userMessage: text,
    toolName: "gem_udtraekte_tilbud",
    toolDescription: "Gem de tilbud, der er fundet i teksten",
    inputSchema,
    zodSchema: resultSchema,
    maxTokens: 8192,
    timeoutMs: 25_000,
  });

  return result.tilbud.map((o) => ({
    ...o,
    storeId: null,
    quantityText: `${o.pack_count > 1 ? o.pack_count + " x " : ""}${o.pack_size} ${o.pack_unit}`,
    is_food: true as const,
  }));
}

export async function extractOffersFromImages(
  supabase: SupabaseClient,
  images: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" }[],
): Promise<(ExtractedOffer & { storeId: null; quantityText: string; is_food: true })[]> {
  const content: Anthropic.MessageParam["content"] = [
    ...images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      }),
    ),
    { type: "text", text: "Udtræk alle dagligvaretilbud fra billedet/billederne ovenfor." },
  ];

  const result = await callClaudeTool({
    supabase,
    purpose: "tilbud_udtraek_billede",
    model: process.env.CLAUDE_MODEL_FAST!,
    system: OFFER_EXTRACT_PROMPT,
    userMessage: content,
    toolName: "gem_udtraekte_tilbud",
    toolDescription: "Gem de tilbud, der er fundet på billedet/billederne",
    inputSchema,
    zodSchema: resultSchema,
    maxTokens: 8192,
    timeoutMs: 25_000,
  });

  return result.tilbud.map((o) => ({
    ...o,
    storeId: null,
    quantityText: `${o.pack_count > 1 ? o.pack_count + " x " : ""}${o.pack_size} ${o.pack_unit}`,
    is_food: true as const,
  }));
}
