import { describe, expect, it } from "vitest";
import { computeUnitPrice, packCost, packsNeeded } from "./unitPrice";

describe("computeUnitPrice", () => {
  it("regner kilopris for en vægtbaseret pakke", () => {
    const result = computeUnitPrice({ packCount: 1, packSize: 300, packUnit: "g", totalPrice: 10 });
    expect(result.kiloPris).toBeCloseTo(33.33, 1);
    expect(result.literPris).toBeNull();
  });

  it("regner literpris for en volumenbaseret pakke", () => {
    const result = computeUnitPrice({ packCount: 1, packSize: 500, packUnit: "ml", totalPrice: 15 });
    expect(result.literPris).toBeCloseTo(30, 5);
    expect(result.kiloPris).toBeNull();
  });

  it("ganger pack_count op for multikøb som '2 for 90,-'", () => {
    const result = computeUnitPrice({ packCount: 2, packSize: 400, packUnit: "g", totalPrice: 90 });
    expect(result.kiloPris).toBeCloseTo(112.5, 2);
  });

  it("har ingen vægt-/volumenpris for stk-baserede pakker", () => {
    const result = computeUnitPrice({ packCount: 1, packSize: 1, packUnit: "stk", totalPrice: 10 });
    expect(result.kiloPris).toBeNull();
    expect(result.literPris).toBeNull();
  });

  it("returnerer null ved manglende eller ugyldig mængde", () => {
    const result = computeUnitPrice({ packCount: 0, packSize: 300, packUnit: "g", totalPrice: 10 });
    expect(result.kiloPris).toBeNull();
    expect(result.literPris).toBeNull();
  });
});

describe("packsNeeded", () => {
  it("runder op til hele pakker", () => {
    expect(packsNeeded(550, 400)).toBe(2);
    expect(packsNeeded(400, 400)).toBe(1);
  });

  it("returnerer 0, hvis der ikke er behov", () => {
    expect(packsNeeded(0, 400)).toBe(0);
  });
});

describe("packCost", () => {
  it("ganger antal pakker med pakkeprisen", () => {
    expect(packCost(3, 20)).toBe(60);
  });
});
