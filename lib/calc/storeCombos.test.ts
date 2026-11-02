import { describe, expect, it } from "vitest";
import { enumerateStoreCombos, cheapestCombo } from "./storeCombos";

describe("enumerateStoreCombos", () => {
  it("giver alle ikke-tomme kombinationer op til maxStores", () => {
    const combos = enumerateStoreCombos(["a", "b", "c"], 2);
    expect(combos).toContainEqual(["a"]);
    expect(combos).toContainEqual(["a", "b"]);
    expect(combos).toContainEqual(["b", "c"]);
    expect(combos.every((c) => c.length <= 2)).toBe(true);
    expect(combos.length).toBe(6); // 3 enkelte + 3 par
  });

  it("med fire butikker og max 2 giver 10 kombinationer (jf. SPEC.md 'højst 15')", () => {
    const combos = enumerateStoreCombos(["a", "b", "c", "d"], 2);
    expect(combos.length).toBe(10);
  });
});

describe("cheapestCombo", () => {
  it("vælger den billigste kombination, der dækker alle varer", () => {
    const combos = enumerateStoreCombos(["a", "b"], 2);
    const items = [
      { sources: [{ storeId: "a", packs: 1, packPrice: 10, isEstimate: false }] },
      { sources: [{ storeId: "b", packs: 1, packPrice: 5, isEstimate: false }] },
    ];
    const result = cheapestCombo(combos, items);
    expect(result?.storeIds.sort()).toEqual(["a", "b"]);
    expect(result?.total).toBe(15);
  });

  it("foretrækker én butik, hvis den dækker alt billigere end to", () => {
    const combos = enumerateStoreCombos(["a", "b"], 2);
    const items = [
      {
        sources: [
          { storeId: "a", packs: 1, packPrice: 8, isEstimate: false },
          { storeId: "b", packs: 1, packPrice: 20, isEstimate: false },
        ],
      },
      {
        sources: [
          { storeId: "a", packs: 1, packPrice: 8, isEstimate: false },
          { storeId: "b", packs: 1, packPrice: 20, isEstimate: false },
        ],
      },
    ];
    const result = cheapestCombo(combos, items);
    expect(result?.storeIds).toEqual(["a"]);
    expect(result?.total).toBe(16);
  });

  it("returnerer null, hvis ingen kombination dækker alle varer", () => {
    const combos = enumerateStoreCombos(["a"], 1);
    const items = [{ sources: [{ storeId: "b", packs: 1, packPrice: 10, isEstimate: false }] }];
    expect(cheapestCombo(combos, items)).toBeNull();
  });

  it("et estimat uden butik kan altid bruges", () => {
    const combos = enumerateStoreCombos(["a"], 1);
    const items = [{ sources: [{ storeId: null, packs: 1, packPrice: 12, isEstimate: true }] }];
    const result = cheapestCombo(combos, items);
    expect(result?.total).toBe(12);
  });
});
