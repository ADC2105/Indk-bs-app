import { describe, expect, it } from "vitest";
import {
  scaleNutrition,
  sumNutrition,
  portionFactor,
  dailyTargetForPlannedMeals,
  macroStatus,
  minimumStatus,
  worstStatus,
} from "./macros";

describe("scaleNutrition", () => {
  it("skalerer næring fra pr. 100 g til en given mængde", () => {
    const result = scaleNutrition({ kcal: 200, protein: 20, carbs: 10, fat: 5, fiber: 2 }, 150);
    expect(result).toEqual({ kcal: 300, protein: 30, carbs: 15, fat: 7.5, fiber: 3 });
  });

  it("håndterer manglende fiber", () => {
    const result = scaleNutrition({ kcal: 100, protein: 10, carbs: 10, fat: 1, fiber: null }, 200);
    expect(result.fiber).toBeNull();
  });
});

describe("sumNutrition", () => {
  it("lægger flere ingredienser sammen", () => {
    const result = sumNutrition([
      { kcal: 100, protein: 10, carbs: 5, fat: 2, fiber: 1 },
      { kcal: 50, protein: 5, carbs: 2, fat: 1, fiber: null },
    ]);
    expect(result).toEqual({ kcal: 150, protein: 15, carbs: 7, fat: 3, fiber: 1 });
  });
});

describe("portionFactor", () => {
  it("regner faktoren ud af måltidsmål og grundportion", () => {
    expect(portionFactor(700, 700)).toBe(1);
    expect(portionFactor(350, 700)).toBe(0.5);
  });

  it("begrænser til 0,5-2,0", () => {
    expect(portionFactor(100, 700)).toBe(0.5);
    expect(portionFactor(3000, 700)).toBe(2.0);
  });
});

describe("dailyTargetForPlannedMeals", () => {
  const shares = { morgenmad: 0.2, frokost: 0.3, aftensmad: 0.35, snack: 0.15 };

  it("summerer andele for planlagte måltider", () => {
    expect(dailyTargetForPlannedMeals(2000, shares, ["aftensmad"])).toBeCloseTo(700, 5);
    expect(dailyTargetForPlannedMeals(2000, shares, ["morgenmad", "aftensmad"])).toBeCloseTo(1100, 5);
  });

  it("giver 0, hvis intet er planlagt", () => {
    expect(dailyTargetForPlannedMeals(2000, shares, [])).toBe(0);
  });
});

describe("macroStatus", () => {
  it("er grøn inden for tolerancen", () => {
    expect(macroStatus(1050, 1000, 0.1)).toBe("grøn");
  });

  it("er gul op til dobbelt tolerance", () => {
    expect(macroStatus(1150, 1000, 0.1)).toBe("gul");
  });

  it("er rød længere væk", () => {
    expect(macroStatus(1300, 1000, 0.1)).toBe("rød");
  });
});

describe("minimumStatus", () => {
  it("er grøn, når minimum er opfyldt eller overgået", () => {
    expect(minimumStatus(120, 100, 0.1)).toBe("grøn");
  });

  it("er gul lige under minimum, inden for tolerancen", () => {
    expect(minimumStatus(95, 100, 0.1)).toBe("gul");
  });

  it("er rød langt under minimum", () => {
    expect(minimumStatus(50, 100, 0.1)).toBe("rød");
  });
});

describe("worstStatus", () => {
  it("vælger den dårligste status", () => {
    expect(worstStatus(["grøn", "gul", "grøn"])).toBe("gul");
    expect(worstStatus(["grøn", "rød", "gul"])).toBe("rød");
    expect(worstStatus(["grøn", "grøn"])).toBe("grøn");
  });
});
