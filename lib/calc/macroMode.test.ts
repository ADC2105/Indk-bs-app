import { describe, expect, it } from "vitest";
import { evaluateDayMacros, evaluateWeekBalanced, DEFAULT_MODE_TOLERANCES } from "./macroMode";

const target = { kcal: 1000, protein: 80, carbs: 100, fat: 40 };

describe("evaluateDayMacros", () => {
  it("fri er altid grøn", () => {
    const result = evaluateDayMacros("fri", { kcal: 2000, protein: 0, carbs: 0, fat: 0 }, target);
    expect(result.overall).toBe("grøn");
  });

  it("minimum: grøn når protein er opfyldt", () => {
    const result = evaluateDayMacros("minimum", { kcal: 900, protein: 85, carbs: 0, fat: 0 }, target);
    expect(result.protein).toBe("grøn");
    expect(result.overall).toBe("grøn");
  });

  it("minimum: rød når protein er langt under", () => {
    const result = evaluateDayMacros("minimum", { kcal: 900, protein: 40, carbs: 0, fat: 0 }, target);
    expect(result.protein).toBe("rød");
    expect(result.overall).toBe("rød");
  });

  it("minimum: respekterer et kalorieloft, hvis sat", () => {
    const result = evaluateDayMacros(
      "minimum",
      { kcal: 1500, protein: 85, carbs: 0, fat: 0 },
      { ...target, kcalCeiling: 1000 },
    );
    expect(result.kcal).not.toBe("grøn");
  });

  it("balanceret er altid grøn pr. dag (tjekkes på ugebasis)", () => {
    const result = evaluateDayMacros("balanceret", { kcal: 2000, protein: 0, carbs: 0, fat: 0 }, target);
    expect(result.overall).toBe("grøn");
  });

  it("skarp: grøn inden for tolerancerne", () => {
    const result = evaluateDayMacros("skarp", { kcal: 1020, protein: 82, carbs: 95, fat: 38 }, target);
    expect(result.overall).toBe("grøn");
  });

  it("skarp: rød hvis kulhydrat afviger meget", () => {
    const result = evaluateDayMacros("skarp", { kcal: 1000, protein: 80, carbs: 10, fat: 40 }, target);
    expect(result.carbs).toBe("rød");
    expect(result.overall).toBe("rød");
  });
});

describe("evaluateWeekBalanced", () => {
  it("grøn når ugens gennemsnit rammer målet", () => {
    const result = evaluateWeekBalanced({ kcal: 1020, protein: 82 }, { kcal: 1000, protein: 80 });
    expect(result.overall).toBe("grøn");
  });

  it("rød når ugens gennemsnit afviger meget i kalorier", () => {
    const result = evaluateWeekBalanced({ kcal: 1400, protein: 82 }, { kcal: 1000, protein: 80 });
    expect(result.kcal).toBe("rød");
  });

  it("bruger standardtolerancerne, hvis ingen er givet", () => {
    const result = evaluateWeekBalanced({ kcal: 1000, protein: 80 }, { kcal: 1000, protein: 80 }, DEFAULT_MODE_TOLERANCES);
    expect(result.overall).toBe("grøn");
  });
});
