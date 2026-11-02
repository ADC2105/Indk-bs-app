"use server";

import { createClient } from "@/lib/supabase/server";
import { generatePlanDraft, applyPlanFixRound, type BuildPlanParams } from "@/lib/plan/buildPlan";

export async function startPlanGeneration(params: BuildPlanParams) {
  const supabase = await createClient();
  try {
    return await generatePlanDraft(supabase, params);
  } catch (err) {
    return { error: "Kunne ikke generere planen: " + (err instanceof Error ? err.message : "ukendt fejl") };
  }
}

export async function continuePlanFix(planId: string) {
  const supabase = await createClient();
  try {
    return await applyPlanFixRound(supabase, planId);
  } catch (err) {
    return { error: "Kunne ikke rette planen: " + (err instanceof Error ? err.message : "ukendt fejl") };
  }
}
