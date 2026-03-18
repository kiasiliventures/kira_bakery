export type FulfillmentMethod = "pickup" | "delivery";

export type DeliveryLocationInput = {
  placeId: string;
  addressText?: string;
  latitude?: number;
  longitude?: number;
};

export type DeliveryResolvedLocation = {
  placeId: string;
  addressText: string;
  latitude: number;
  longitude: number;
};

export type DeliveryStoreLocation = {
  id: string;
  code: string;
  name: string;
  addressText: string;
  latitude: number;
  longitude: number;
};

export type DeliveryPricingBracket = {
  id: string;
  minDistanceKm: number;
  maxDistanceKm: number;
  fee: number;
  sortOrder: number;
};

export type DeliveryPricingConfig = {
  id: string;
  name: string;
  maxDeliveryDistanceKm: number | null;
  storeLocation: DeliveryStoreLocation;
  brackets: DeliveryPricingBracket[];
};

export type DeliveryQuote = {
  currency: "UGX";
  distanceKm: number;
  deliveryFee: number;
  quoteToken: string;
  pricingConfigId: string;
  storeLocationId: string;
  store: DeliveryStoreLocation;
  destination: DeliveryResolvedLocation;
};

export type DeliveryAutocompleteSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
};
