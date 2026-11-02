import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaudeTool } from "./client";
import { MADPLAN_FORSLAG_PROMPT } from "./prompts/madplanForslag";
import { MADPLAN_RET_PROMPT } from "./prompts/madplanRet";
import { MADPLAN_BYT_PROMPT } from "./prompts/madplanByt";

const ingredientSchema = z.object({
  name: z.string(),
  grams_raw: z.number().positive(),
  source: z.enum(["offer", "pantry", "staple", "buy"]),
  offer_id: z.string().nullish(),
  pantry_item_id: z.string().nullish(),
});

const mealSchema = z.object({
  date: z.string(),
  meal_type: z.enum(["morgenmad", "frokost", "aftensmad", "snack"]),
  title: z.string(),
  description: z.string().nullish(),
  base_servings: z.number().positive(),
  prep_minutes: z.number().nullish(),
  steps: z.array(z.string()),
  ingredients: z.array(ingredientSchema),
});

const planResultSchema = z.object({ meals: z.array(mealSchema) });

export type PlannerMeal = z.infer<typeof mealSchema>;
export type PlannerResult = z.infer<typeof planResultSchema>;

const inputSchema = {
  type: "object" as const,
  properties: {
    meals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "ÅÅÅÅ-MM-DD" },
          meal_type: { type: "string", enum: ["morgenmad", "frokost", "aftensmad", "snack"] },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          base_servings: { type: "number" },
          prep_minutes: { type: ["number", "null"] },
          steps: { type: "array", items: { type: "string" } },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                grams_raw: { type: "number" },
                source: { type: "string", enum: ["offer", "pantry", "staple", "buy"] },
                offer_id: { type: ["string", "null"] },
                pantry_item_id: { type: ["string", "null"] },
              },
              required: ["name", "grams_raw", "source"],
            },
          },
        },
        required: ["date", "meal_type", "title", "base_servings", "steps", "ingredients"],
      },
    },
  },
  required: ["meals"],
};

async function callPlanner(
  supabase: SupabaseClient,
  purpose: string,
  system: string,
  userMessage: string,
): Promise<PlannerResult> {
  return callClaudeTool({
    supabase,
    purpose,
    model: process.env.CLAUDE_MODEL_PLANNER!,
    system,
    userMessage,
    toolName: "foreslaa_retter",
    toolDescription: "Gem de foreslåede/rettede retter",
    inputSchema,
    zodSchema: planResultSchema,
    maxTokens: 16000,
  });
}

export async function generateMealPlan(supabase: SupabaseClient, userMessage: string): Promise<PlannerResult> {
  return callPlanner(supabase, "madplan_forslag", MADPLAN_FORSLAG_PROMPT, userMessage);
}

export async function fixMealPlan(supabase: SupabaseClient, userMessage: string): Promise<PlannerResult> {
  return callPlanner(supabase, "madplan_ret", MADPLAN_RET_PROMPT, userMessage);
}

export async function suggestSwapOptions(supabase: SupabaseClient, userMessage: string): Promise<PlannerResult> {
  return callPlanner(supabase, "madplan_byt", MADPLAN_BYT_PROMPT, userMessage);
}
