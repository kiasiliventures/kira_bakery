import "server-only";

import { DeliveryError } from "@/lib/delivery/errors";
import type { DeliveryDistanceProvider } from "@/lib/delivery/provider";
import type {
  DeliveryAutocompleteSuggestion,
  DeliveryLocationInput,
  DeliveryResolvedLocation,
} from "@/lib/delivery/types";

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: {
        text?: string;
      };
      structuredFormat?: {
        mainText?: {
          text?: string;
        };
        secondaryText?: {
          text?: string;
        };
      };
    };
  }>;
};

type GooglePlaceDetailsResponse = {
  id?: string;
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

type GoogleRoutesResponse = {
  routes?: Array<{
    distanceMeters?: number;
  }>;
};

function requireGoogleMapsApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  if (!apiKey) {
    throw new DeliveryError(
      "DELIVERY_PROVIDER_NOT_CONFIGURED",
      "Delivery maps provider is not configured yet. Please use pickup for now.",
      503,
    );
  }

  return apiKey;
}

function getGoogleMapsRegionCode() {
  return process.env.GOOGLE_MAPS_AUTOCOMPLETE_REGION?.trim().toUpperCase() || "UG";
}

function getGoogleMapsLanguageCode() {
  return process.env.GOOGLE_MAPS_LANGUAGE_CODE?.trim() || "en";
}

async function googleMapsRequest<T>(
  url: string,
  init: RequestInit,
  fieldMask: string,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": requireGoogleMapsApiKey(),
      "X-Goog-FieldMask": fieldMask,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    console.error("delivery_google_maps_request_failed", {
      url,
      status: response.status,
      body: responseBody,
    });

    throw new DeliveryError(
      "DELIVERY_PROVIDER_FAILED",
      "We could not verify that delivery route right now. Please try again.",
      502,
    );
  }

  return (await response.json()) as T;
}

export class GoogleMapsDeliveryProvider implements DeliveryDistanceProvider {
  async autocompletePlaces(
    input: string,
    options?: { sessionToken?: string; limit?: number },
  ): Promise<DeliveryAutocompleteSuggestion[]> {
    const trimmedInput = input.trim();
    if (trimmedInput.length < 3) {
      return [];
    }

    const response = await googleMapsRequest<GoogleAutocompleteResponse>(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        body: JSON.stringify({
          input: trimmedInput,
          includedRegionCodes: [getGoogleMapsRegionCode()],
          languageCode: getGoogleMapsLanguageCode(),
          sessionToken: options?.sessionToken,
        }),
      },
      [
        "suggestions.placePrediction.placeId",
        "suggestions.placePrediction.text.text",
        "suggestions.placePrediction.structuredFormat.mainText.text",
        "suggestions.placePrediction.structuredFormat.secondaryText.text",
      ].join(","),
    );

    const suggestions = response.suggestions ?? [];
    const limited = suggestions.slice(0, options?.limit ?? 5);

    return limited
      .map((entry) => {
        const placePrediction = entry.placePrediction;
        const placeId = placePrediction?.placeId?.trim();
        const fullText = placePrediction?.text?.text?.trim() ?? "";
        const primaryText = placePrediction?.structuredFormat?.mainText?.text?.trim() ?? fullText;
        const secondaryText = placePrediction?.structuredFormat?.secondaryText?.text?.trim() ?? "";

        if (!placeId || !fullText) {
          return null;
        }

        return {
          placeId,
          primaryText,
          secondaryText,
          fullText,
        };
      })
      .filter((entry): entry is DeliveryAutocompleteSuggestion => Boolean(entry));
  }

  async resolvePlace(input: DeliveryLocationInput): Promise<DeliveryResolvedLocation> {
    const placeId = input.placeId?.trim();
    if (!placeId) {
      throw new DeliveryError(
        "DELIVERY_INVALID_REQUEST",
        "Select a valid delivery location before continuing.",
        400,
      );
    }

    const encodedPlaceId = encodeURIComponent(placeId);
    const response = await googleMapsRequest<GooglePlaceDetailsResponse>(
      `https://places.googleapis.com/v1/places/${encodedPlaceId}`,
      {
        method: "GET",
      },
      "id,formattedAddress,location",
    );

    const latitude = response.location?.latitude;
    const longitude = response.location?.longitude;
    const addressText = response.formattedAddress?.trim() || input.addressText?.trim() || "";

    if (typeof latitude !== "number" || typeof longitude !== "number" || !addressText) {
      throw new DeliveryError(
        "DELIVERY_PLACE_NOT_FOUND",
        "We could not verify that delivery location. Please choose another result.",
        400,
      );
    }

    return {
      placeId: response.id?.trim() || placeId,
      addressText,
      latitude,
      longitude,
    };
  }

  async computeRouteDistanceKm(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
  ): Promise<number> {
    const response = await googleMapsRequest<GoogleRoutesResponse>(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: origin.latitude,
                longitude: origin.longitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: destination.latitude,
                longitude: destination.longitude,
              },
            },
          },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          languageCode: getGoogleMapsLanguageCode(),
          units: "METRIC",
        }),
      },
      "routes.distanceMeters",
    );

    const distanceMeters = response.routes?.[0]?.distanceMeters;
    if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters)) {
      throw new DeliveryError(
        "DELIVERY_DISTANCE_UNAVAILABLE",
        "We could not calculate the delivery route for that location.",
        400,
      );
    }

    return distanceMeters / 1000;
  }
}

export function getGoogleMapsDeliveryProvider() {
  return new GoogleMapsDeliveryProvider();
}
