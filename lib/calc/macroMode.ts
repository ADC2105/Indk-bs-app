import { macroStatus, minimumStatus, worstStatus, type MacroStatus } from "./macros";

export type MacroMode = "fri" | "minimum" | "balanceret" | "skarp";

export type MacroActuals = { kcal: number; protein: number; carbs: number; fat: number };

export type ModeTolerances = {
  /** Hvor tæt på minimum tæller som gul, før det bliver rødt (fx 0.1 = 10 %). */
  minimumTolerance: number;
  /** Balanceret: kalorie-tolerance på ugens gennemsnit (fx 0.10). */
  balanceretKcalTolerance: number;
  /** Skarp: daglig kalorie-tolerance (fx 0.05). */
  skarpKcalTolerance: number;
  /** Skarp: tolerance for protein/kulhydrat/fedt (fx 0.10). */
  skarpMacroTolerance: number;
};

export const DEFAULT_MODE_TOLERANCES: ModeTolerances = {
  minimumTolerance: 0.1,
  balanceretKcalTolerance: 0.1,
  skarpKcalTolerance: 0.05,
  skarpMacroTolerance: 0.1,
};

export type MacroEvaluation = {
  kcal: MacroStatus;
  protein: MacroStatus;
  carbs: MacroStatus;
  fat: MacroStatus;
  overall: MacroStatus;
};

const ALL_GREEN: MacroEvaluation = { kcal: "grøn", protein: "grøn", carbs: "grøn", fat: "grøn", overall: "grøn" };

/**
 * Daglig status for en person. Bruges for "minimum" og "skarp" - "fri" har
 * ingen makrokrav, og "balanceret" tjekkes på ugens gennemsnit i stedet
 * (se evaluateWeekBalanced), så begge giver altid grønt her.
 */
export function evaluateDayMacros(
  mode: MacroMode,
  actual: MacroActuals,
  target: MacroActuals & { kcalCeiling?: number | null },
  tolerances: ModeTolerances = DEFAULT_MODE_TOLERANCES,
): MacroEvaluation {
  if (mode === "fri" || mode === "balanceret") return ALL_GREEN;

  if (mode === "minimum") {
    const protein = minimumStatus(actual.protein, target.protein, tolerances.minimumTolerance);
    const kcal =
      target.kcalCeiling != null && actual.kcal > target.kcalCeiling
        ? macroStatus(actual.kcal, target.kcalCeiling, tolerances.minimumTolerance)
        : "grøn";
    return { kcal, protein, carbs: "grøn", fat: "grøn", overall: worstStatus([kcal, protein]) };
  }

  // skarp
  const kcal = macroStatus(actual.kcal, target.kcal, tolerances.skarpKcalTolerance);
  const protein = macroStatus(actual.protein, target.protein, tolerances.skarpMacroTolerance);
  const carbs = macroStatus(actual.carbs, target.carbs, tolerances.skarpMacroTolerance);
  const fat = macroStatus(actual.fat, target.fat, tolerances.skarpMacroTolerance);
  return { kcal, protein, carbs, fat, overall: worstStatus([kcal, protein, carbs, fat]) };
}

/** Status for "balanceret": tjekkes på ugens gennemsnit, ikke pr. dag. */
export function evaluateWeekBalanced(
  weekAvgActual: Pick<MacroActuals, "kcal" | "protein">,
  dailyTarget: Pick<MacroActuals, "kcal" | "protein">,
  tolerances: ModeTolerances = DEFAULT_MODE_TOLERANCES,
): MacroEvaluation {
  const kcal = macroStatus(weekAvgActual.kcal, dailyTarget.kcal, tolerances.balanceretKcalTolerance);
  const protein = minimumStatus(weekAvgActual.protein, dailyTarget.protein, tolerances.minimumTolerance);
  return { kcal, protein, carbs: "grøn", fat: "grøn", overall: worstStatus([kcal, protein]) };
}
