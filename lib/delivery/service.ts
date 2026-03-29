import "server-only";

import { unstable_cache } from "next/cache";
import { createDeliveryQuoteToken } from "@/lib/delivery/quote-token";
import { DeliveryError } from "@/lib/delivery/errors";
import { getGoogleMapsDeliveryProvider } from "@/lib/delivery/providers/google-maps";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DeliveryAutocompleteSuggestion,
  DeliveryLocationInput,
  DeliveryPricingBracket,
  DeliveryPricingConfig,
  DeliveryQuote,
  DeliveryStoreLocation,
} from "@/lib/delivery/types";

type NumericValue = number | string | null;

type StoreLocationRow = {
  id: string;
  code: string;
  name: string;
  address_text: string;
  latitude: NumericValue;
  longitude: NumericValue;
  is_active: boolean;
};

type DeliveryPricingConfigRow = {
  id: string;
  name: string;
  store_location_id: string;
  max_delivery_distance_km: NumericValue;
  is_active: boolean;
};

type DeliveryPricingBracketRow = {
  id: string;
  min_distance_km: NumericValue;
  max_distance_km: NumericValue;
  fee: number;
  sort_order: number;
};

function toNumber(value: NumericValue, fieldName: string) {
  const numericValue = typeof value === "string" ? Number(value) : value;
  if (typeof numericValue !== "number" || Number.isNaN(numericValue)) {
    throw new Error(`Invalid numeric value for ${fieldName}`);
  }

  return numericValue;
}

function roundDistanceForPricing(distanceKm: number) {
  return Math.round(distanceKm * 100) / 100;
}

function normalizeStoreLocation(row: StoreLocationRow): DeliveryStoreLocation {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    addressText: row.address_text,
    latitude: toNumber(row.latitude, "store_locations.latitude"),
    longitude: toNumber(row.longitude, "store_locations.longitude"),
  };
}

function normalizeBracket(row: DeliveryPricingBracketRow): DeliveryPricingBracket {
  return {
    id: row.id,
    minDistanceKm: toNumber(row.min_distance_km, "delivery_pricing_brackets.min_distance_km"),
    maxDistanceKm: toNumber(row.max_distance_km, "delivery_pricing_brackets.max_distance_km"),
    fee: row.fee,
    sortOrder: row.sort_order,
  };
}

async function loadActiveDeliveryPricingConfig(): Promise<DeliveryPricingConfig> {
  const supabase = getSupabaseServerClient();

  const { data: configRow, error: configError } = await supabase
    .from("delivery_pricing_configs")
    .select("id,name,store_location_id,max_delivery_distance_km,is_active")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (configError) {
    console.error("delivery_pricing_config_lookup_failed", configError.message);
    throw new DeliveryError(
      "DELIVERY_PRICING_NOT_FOUND",
      "Delivery pricing is not available right now. Please use pickup for now.",
      503,
    );
  }

  const config = configRow as DeliveryPricingConfigRow | null;
  if (!config) {
    throw new DeliveryError(
      "DELIVERY_PRICING_NOT_FOUND",
      "Delivery pricing is not configured yet. Please use pickup for now.",
      503,
    );
  }

  const { data: storeRow, error: storeError } = await supabase
    .from("store_locations")
    .select("id,code,name,address_text,latitude,longitude,is_active")
    .eq("id", config.store_location_id)
    .eq("is_active", true)
    .maybeSingle();

  if (storeError) {
    console.error("delivery_store_lookup_failed", storeError.message);
    throw new DeliveryError(
      "DELIVERY_STORE_NOT_FOUND",
      "The bakery delivery location is not configured right now. Please use pickup for now.",
      503,
    );
  }

  const store = storeRow as StoreLocationRow | null;
  if (!store) {
    throw new DeliveryError(
      "DELIVERY_STORE_NOT_FOUND",
      "The bakery delivery location is missing. Please use pickup for now.",
      503,
    );
  }

  const { data: bracketRows, error: bracketError } = await supabase
    .from("delivery_pricing_brackets")
    .select("id,min_distance_km,max_distance_km,fee,sort_order")
    .eq("pricing_config_id", config.id)
    .order("sort_order", { ascending: true });

  if (bracketError) {
    console.error("delivery_pricing_brackets_lookup_failed", bracketError.message);
    throw new DeliveryError(
      "DELIVERY_PRICING_NOT_FOUND",
      "Delivery pricing brackets are unavailable right now. Please use pickup for now.",
      503,
    );
  }

  const brackets = ((bracketRows ?? []) as DeliveryPricingBracketRow[]).map(normalizeBracket);
  if (brackets.length === 0) {
    throw new DeliveryError(
      "DELIVERY_PRICING_NOT_FOUND",
      "Delivery pricing brackets are not configured yet. Please use pickup for now.",
      503,
    );
  }

  return {
    id: config.id,
    name: config.name,
    maxDeliveryDistanceKm:
      config.max_delivery_distance_km === null
        ? null
        : toNumber(config.max_delivery_distance_km, "delivery_pricing_configs.max_delivery_distance_km"),
    storeLocation: normalizeStoreLocation(store),
    brackets,
  };
}

const getCachedActiveDeliveryPricingConfig = unstable_cache(
  loadActiveDeliveryPricingConfig,
  ["active-delivery-pricing-config"],
  { revalidate: 600 },
);

function findMatchingBracket(
  brackets: DeliveryPricingBracket[],
  distanceKm: number,
) {
  return brackets.find(
    (bracket) => distanceKm >= bracket.minDistanceKm && distanceKm <= bracket.maxDistanceKm,
  );
}

export async function autocompleteDeliveryPlaces(
  input: string,
  options?: { sessionToken?: string; limit?: number },
): Promise<DeliveryAutocompleteSuggestion[]> {
  const provider = getGoogleMapsDeliveryProvider();
  return provider.autocompletePlaces(input, options);
}

export async function quoteDelivery(input: DeliveryLocationInput): Promise<DeliveryQuote> {
  const provider = getGoogleMapsDeliveryProvider();
  const pricingConfig = await getCachedActiveDeliveryPricingConfig();
  const destination = await provider.resolvePlace(input);
  const routeDistanceKm = await provider.computeRouteDistanceKm(
    {
      latitude: pricingConfig.storeLocation.latitude,
      longitude: pricingConfig.storeLocation.longitude,
    },
    {
      latitude: destination.latitude,
      longitude: destination.longitude,
    },
  );
  const distanceKm = roundDistanceForPricing(routeDistanceKm);

  if (
    pricingConfig.maxDeliveryDistanceKm !== null
    && distanceKm > pricingConfig.maxDeliveryDistanceKm
  ) {
    throw new DeliveryError(
      "DELIVERY_OUT_OF_RANGE",
      `That address is outside our ${pricingConfig.maxDeliveryDistanceKm.toFixed(2)} km delivery range.`,
      400,
    );
  }

  const matchingBracket = findMatchingBracket(pricingConfig.brackets, distanceKm);
  if (!matchingBracket) {
    throw new DeliveryError(
      "DELIVERY_BRACKET_NOT_FOUND",
      "We could not find a delivery price for that route distance.",
      400,
    );
  }

  const quote = {
    currency: "UGX" as const,
    distanceKm,
    deliveryFee: matchingBracket.fee,
    pricingConfigId: pricingConfig.id,
    storeLocationId: pricingConfig.storeLocation.id,
    store: pricingConfig.storeLocation,
    destination,
  };

  return {
    ...quote,
    quoteToken: createDeliveryQuoteToken(quote),
  };
}
