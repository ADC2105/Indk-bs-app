export type RawOffer = {
  externalId: string;
  storeId: string;
  source: "tjek" | "manual";
  heading: string;
  description: string | null;
  price: number | null;
  quantityText: string | null;
  validFrom: string | null;
  validUntil: string | null;
  imageUrl: string | null;
  raw: unknown;
};

export type OfferSourceStore = {
  id: string;
  name: string;
  tjekDealerId: string | null;
};

export interface OfferSource {
  fetchOffers(params: {
    lat: number;
    lng: number;
    radiusKm: number;
    stores: OfferSourceStore[];
    shoppingDate: Date;
  }): Promise<RawOffer[]>;
}
