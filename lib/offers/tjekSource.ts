import type { OfferSource, OfferSourceStore, RawOffer } from "./types";

const BASE_URL = "https://squid-api.tjek.com/v2";
const PAGE_SIZE = 100;
const REQUEST_PAUSE_MS = 350;

// Kataloger, der tydeligvis ikke er dagligvarer, filtreres fra før normalisering.
const NONFOOD_KEYWORDS = ["jul", "legetøj", "vin katalog", "nonfood", "have", "elektronik", "tøj", "boern", "børn"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tjekGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Tjek-kald fejlede (${response.status}): ${path}`);
  }
  return response.json() as Promise<T>;
}

type TjekDealer = { id: string; name: string };

/** Finder en kædes dealer-id ved navn. Returnerer bedste match eller null. */
export async function findDealerId(storeName: string): Promise<string | null> {
  const results = await tjekGet<TjekDealer[]>("/dealers", { query: storeName, limit: "10" });
  const exact = results.find((d) => d.name.toLowerCase() === storeName.toLowerCase());
  return exact?.id ?? results[0]?.id ?? null;
}

type TjekCatalog = {
  id: string;
  dealer_id: string;
  label: string;
  run_from: string;
  run_till: string;
  page_count: number;
};

async function fetchCatalogsForDealers(
  dealerIds: string[],
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<TjekCatalog[]> {
  return tjekGet<TjekCatalog[]>("/catalogs", {
    dealer_ids: dealerIds.join(","),
    r_lat: String(lat),
    r_lng: String(lng),
    r_radius: String(Math.round(radiusKm * 1000)),
    limit: "100",
  });
}

/**
 * Vælger den/de dagligvarekataloger for én kæde, der gælder på indkøbsdagen.
 * Kædernes ugentlige tilbudsavis indeholder typisk "uge" i navnet (fx
 * "Netto uge 45", "Lidl avis (uge 45)") - det bruges som det primære signal.
 * Åbenlyse nonfood-kataloger (jul, legetøj, vin ...) frasorteres altid.
 */
function pickGroceryCatalogs(catalogs: TjekCatalog[], shoppingDate: Date): TjekCatalog[] {
  const validToday = catalogs.filter((c) => {
    const from = new Date(c.run_from);
    const until = new Date(c.run_till);
    return from <= shoppingDate && shoppingDate <= until;
  });

  const food = validToday.filter(
    (c) => !NONFOOD_KEYWORDS.some((kw) => c.label.toLowerCase().includes(kw)),
  );

  const weekly = food.filter((c) => /uge\s*\d+/i.test(c.label));
  if (weekly.length > 0) return weekly;

  // Ingen tydelig "uge N"-avis fundet - brug den største (flest sider) som fallback.
  if (food.length > 0) {
    return [food.reduce((a, b) => (b.page_count > a.page_count ? b : a))];
  }
  return [];
}

type TjekOffer = {
  id: string;
  heading: string;
  description: string | null;
  pricing: { price: number | null; pre_price: number | null; currency: string };
  quantity: {
    unit: { symbol: string } | null;
    size: { from: number | null; to: number | null } | null;
    pieces: { from: number | null; to: number | null } | null;
  };
  run_from: string;
  run_till: string;
  catalog_id: string;
  images?: { view?: string };
};

function buildQuantityText(q: TjekOffer["quantity"]): string | null {
  const unit = q.unit?.symbol;
  const size = q.size;
  if (!unit || !size || size.from == null) return null;
  const sizeText = size.to != null && size.to !== size.from ? `${size.from}-${size.to} ${unit}` : `${size.from} ${unit}`;
  const pieces = q.pieces?.from;
  if (pieces && pieces > 1) {
    return `${pieces} x ${sizeText}`;
  }
  return sizeText;
}

async function fetchAllOffersForCatalog(catalogId: string): Promise<TjekOffer[]> {
  const all: TjekOffer[] = [];
  let offset = 0;
  for (;;) {
    const page = await tjekGet<TjekOffer[]>("/offers", {
      catalog_ids: catalogId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await sleep(REQUEST_PAUSE_MS);
  }
  return all;
}

export const tjekSource: OfferSource = {
  async fetchOffers({ lat, lng, radiusKm, stores, shoppingDate }) {
    const result: RawOffer[] = [];

    for (const store of stores as OfferSourceStore[]) {
      if (!store.tjekDealerId) continue;

      await sleep(REQUEST_PAUSE_MS);
      const catalogs = await fetchCatalogsForDealers([store.tjekDealerId], lat, lng, radiusKm);
      const groceryCatalogs = pickGroceryCatalogs(catalogs, shoppingDate);

      for (const catalog of groceryCatalogs) {
        await sleep(REQUEST_PAUSE_MS);
        const offers = await fetchAllOffersForCatalog(catalog.id);

        for (const offer of offers) {
          result.push({
            externalId: offer.id,
            storeId: store.id,
            source: "tjek",
            heading: offer.heading,
            description: offer.description,
            price: offer.pricing.price,
            quantityText: buildQuantityText(offer.quantity),
            validFrom: offer.run_from,
            validUntil: offer.run_till,
            imageUrl: offer.images?.view ?? null,
            raw: offer,
          });
        }
      }
    }

    return result;
  },
};
