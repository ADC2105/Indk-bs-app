/** Alle ikke-tomme kombinationer af butikker, højst `maxStores` ad gangen. */
export function enumerateStoreCombos(storeIds: string[], maxStores: number): string[][] {
  const combos: string[][] = [];

  function backtrack(start: number, current: string[]) {
    if (current.length > 0) combos.push([...current]);
    if (current.length === maxStores) return;
    for (let i = start; i < storeIds.length; i++) {
      current.push(storeIds[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return combos;
}

export type ItemSource = {
  storeId: string | null;
  packs: number;
  packPrice: number;
  isEstimate: boolean;
};

export type ItemOption = {
  /** Mulige kilder til varen: pr. butik (tilbud/normalpris) og evt. et estimat uden butik. */
  sources: ItemSource[];
};

/**
 * Vælger den billigste butikskombination, der kan dække alle varer, blandt
 * de givne kombinationer. For hver vare bruges den billigste kilde, der hører
 * til en butik i kombinationen (et estimat uden butik kan altid bruges).
 */
export function cheapestCombo(
  combos: string[][],
  items: ItemOption[],
): { storeIds: string[]; total: number; perItem: ItemSource[] } | null {
  let best: { storeIds: string[]; total: number; perItem: ItemSource[] } | null = null;

  for (const combo of combos) {
    const comboSet = new Set(combo);
    let total = 0;
    const perItem: ItemSource[] = [];
    let feasible = true;

    for (const item of items) {
      const available = item.sources.filter((s) => s.storeId === null || comboSet.has(s.storeId));
      if (available.length === 0) {
        feasible = false;
        break;
      }
      const cheapest = available.reduce((a, b) => (b.packPrice * b.packs < a.packPrice * a.packs ? b : a));
      total += cheapest.packPrice * cheapest.packs;
      perItem.push(cheapest);
    }

    if (feasible && (!best || total < best.total)) {
      best = { storeIds: combo, total, perItem };
    }
  }

  return best;
}
