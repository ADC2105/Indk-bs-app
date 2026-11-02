import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaudeTool } from "./client";
import { PRICE_ESTIMATE_PROMPT } from "./prompts/prisEstimat";

const resultSchema = z.object({ price: z.number().positive() });

const inputSchema = {
  type: "object" as const,
  properties: { price: { type: "number", description: "Pris i kroner for pakken" } },
  required: ["price"],
};

export async function estimatePrice(
  supabase: SupabaseClient,
  name: string,
  packSize: number | null,
  packUnit: string | null,
): Promise<number> {
  const userMessage = JSON.stringify({ navn: name, pakkestørrelse: packSize, enhed: packUnit });
  const result = await callClaudeTool({
    supabase,
    purpose: "pris_estimat",
    model: process.env.CLAUDE_MODEL_FAST!,
    system: PRICE_ESTIMATE_PROMPT,
    userMessage,
    toolName: "estimer_pris",
    toolDescription: "Gem prisestimatet",
    inputSchema,
    zodSchema: resultSchema,
  });
  return result.price;
}
