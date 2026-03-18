import type {
  DeliveryAutocompleteSuggestion,
  DeliveryLocationInput,
  DeliveryResolvedLocation,
} from "@/lib/delivery/types";

export interface DeliveryDistanceProvider {
  autocompletePlaces(
    input: string,
    options?: { sessionToken?: string; limit?: number },
  ): Promise<DeliveryAutocompleteSuggestion[]>;
  resolvePlace(input: DeliveryLocationInput): Promise<DeliveryResolvedLocation>;
  computeRouteDistanceKm(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
  ): Promise<number>;
}
