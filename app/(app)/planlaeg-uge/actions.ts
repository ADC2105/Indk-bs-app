"use server";

import { createClient } from "@/lib/supabase/server";
import {
  startPlanGeneration,
  resolveNextPlanBatch,
  finalizePlanGeneration,
  startPlanFix,
  type BuildPlanParams,
} from "@/lib/plan/buildPlan";

function errorResult(prefix: string, err: unknown) {
  return { error: prefix + (err instanceof Error ? err.message : "ukendt fejl") };
}

export async function beginGeneration(params: BuildPlanParams) {
  const supabase = await createClient();
  try {
    return await startPlanGeneration(supabase, params);
  } catch (err) {
    return errorResult("Kunne ikke starte generering: ", err);
  }
}

export async function resolveBatch(planId: string) {
  const supabase = await createClient();
  try {
    return await resolveNextPlanBatch(supabase, planId);
  } catch (err) {
    return errorResult("Kunne ikke behandle ingredienser: ", err);
  }
}

export async function finalizeGeneration(planId: string) {
  const supabase = await createClient();
  try {
    return await finalizePlanGeneration(supabase, planId);
  } catch (err) {
    return errorResult("Kunne ikke færdiggøre planen: ", err);
  }
}

export async function beginFix(planId: string) {
  const supabase = await createClient();
  try {
    return await startPlanFix(supabase, planId);
  } catch (err) {
    return errorResult("Kunne ikke starte tilretning: ", err);
  }
}
