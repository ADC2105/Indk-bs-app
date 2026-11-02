import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaudeTool } from "./client";
import { PANTRY_PARSE_PROMPT } from "./prompts/beholdningFritekst";

export const pantryParseItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.enum(["g", "kg", "ml", "l", "stk"]).nullable(),
  location: z.enum(["køleskab", "fryser", "skab"]).nullable(),
});

export const pantryParseResultSchema = z.object({
  items: z.array(pantryParseItemSchema),
});

export type PantryParseItem = z.infer<typeof pantryParseItemSchema>;

const inputSchema = {
  type: "object" as const,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Generisk dansk varenavn i ental, uden mængde",
          },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"], enum: ["g", "kg", "ml", "l", "stk", null] },
          location: {
            type: ["string", "null"],
            enum: ["køleskab", "fryser", "skab", null],
          },
        },
        required: ["name", "quantity", "unit", "location"],
      },
    },
  },
  required: ["items"],
};

export async function parsePantryText(supabase: SupabaseClient, text: string) {
  return callClaudeTool({
    supabase,
    purpose: "beholdning_fritekst",
    model: process.env.CLAUDE_MODEL_FAST!,
    system: PANTRY_PARSE_PROMPT,
    userMessage: text,
    toolName: "gem_varer",
    toolDescription: "Gem de varer, der er genkendt i fritekst",
    inputSchema,
    zodSchema: pantryParseResultSchema,
  });
}
