export type PackUnit = "g" | "ml" | "stk";

export type UnitPriceInput = {
  packCount: number;
  packSize: number;
  packUnit: PackUnit;
  totalPrice: number;
};

export type UnitPriceResult = {
  /** Kr. pr. kg, kun for g-baserede pakker. */
  kiloPris: number | null;
  /** Kr. pr. liter, kun for ml-baserede pakker. */
  literPris: number | null;
};

/**
 * Regner kilo-/literpris ud af et tilbud. Multikøb (fx "2 for 90,-") er
 * allerede total_price for pack_count enheder, så den samlede mængde er
 * packCount * packSize. Stk-baserede pakker har ingen vægt-/volumenpris.
 */
export function computeUnitPrice({
  packCount,
  packSize,
  packUnit,
  totalPrice,
}: UnitPriceInput): UnitPriceResult {
  const totalAmount = packCount * packSize;
  if (!(totalAmount > 0) || !(totalPrice >= 0)) {
    return { kiloPris: null, literPris: null };
  }

  if (packUnit === "g") {
    return { kiloPris: (totalPrice / totalAmount) * 1000, literPris: null };
  }
  if (packUnit === "ml") {
    return { kiloPris: null, literPris: (totalPrice / totalAmount) * 1000 };
  }
  return { kiloPris: null, literPris: null };
}

/** Pris for antal hele pakker, der skal købes for at dække et behov. */
export function packsNeeded(neededAmount: number, packSize: number): number {
  if (!(packSize > 0) || !(neededAmount > 0)) return 0;
  return Math.ceil(neededAmount / packSize);
}

export function packCost(packs: number, packPrice: number): number {
  return packs * packPrice;
}
