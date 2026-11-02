import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaudeTool } from "./client";
import { INGREDIENT_MATCH_PROMPT } from "./prompts/ingrediensMatch";

// Claude udelader ofte helt den gren af svaret, den ikke bruger (fx
// "estimate", når der er fundet et match), i stedet for at sætte den til
// null. Felterne skal derfor tåle at mangle helt, ikke kun være nullable.
const matchResultSchema = z.object({
  food_id: z.string().uuid().nullish(),
  confidence: z.number().min(0).max(1).nullish(),
  estimate: z
    .object({
      kcal: z.number(),
      protein: z.number(),
      carbs: z.number(),
      fat: z.number(),
      fiber: z.number().nullish(),
    })
    .nullish(),
});

export type FoodMatchResult = z.infer<typeof matchResultSchema>;

const inputSchema = {
  type: "object" as const,
  properties: {
    food_id: { type: ["string", "null"], description: "uuid for den valgte kandidat, eller null" },
    confidence: { type: ["number", "null"] },
    estimate: {
      type: ["object", "null"],
      properties: {
        kcal: { type: "number" },
        protein: { type: "number" },
        carbs: { type: "number" },
        fat: { type: "number" },
        fiber: { type: ["number", "null"] },
      },
      required: ["kcal", "protein", "carbs", "fat", "fiber"],
    },
  },
  required: ["food_id", "confidence", "estimate"],
};

export async function matchIngredientWithClaude(
  supabase: SupabaseClient,
  ingredientName: string,
  candidates: { id: string; name_da: string }[],
): Promise<FoodMatchResult> {
  const userMessage = JSON.stringify({ ingrediens: ingredientName, kandidater: candidates });

  return callClaudeTool({
    supabase,
    purpose: "ingrediens_match",
    model: process.env.CLAUDE_MODEL_FAST!,
    system: INGREDIENT_MATCH_PROMPT,
    userMessage,
    toolName: "match_ingrediens",
    toolDescription: "Match ingrediensen til en fødevare, eller giv et estimat",
    inputSchema,
    zodSchema: matchResultSchema,
  });
}
