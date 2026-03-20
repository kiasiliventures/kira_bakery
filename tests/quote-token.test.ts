import { afterEach, describe, expect, it } from "vitest";

describe("delivery quote token regression tests", () => {
  const originalSecret = process.env.DELIVERY_QUOTE_TOKEN_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.DELIVERY_QUOTE_TOKEN_SECRET;
      return;
    }

    process.env.DELIVERY_QUOTE_TOKEN_SECRET = originalSecret;
  });

  it("rejects tampered delivery quote tokens", async () => {
    process.env.DELIVERY_QUOTE_TOKEN_SECRET = "test-delivery-quote-secret";

    const { createDeliveryQuoteToken, verifyDeliveryQuoteToken } = await import("@/lib/delivery/quote-token");

    const token = createDeliveryQuoteToken({
      destination: {
        placeId: "place-123",
        addressText: "Kira Town",
        latitude: 0.39,
        longitude: 32.61,
      },
      distanceKm: 4.2,
      deliveryFee: 8000,
      pricingConfigId: "pricing-config-1",
      storeLocationId: "store-location-1",
    });

    expect(verifyDeliveryQuoteToken(token)).toEqual(
      expect.objectContaining({
        distanceKm: 4.2,
        deliveryFee: 8000,
        pricingConfigId: "pricing-config-1",
        storeLocationId: "store-location-1",
      }),
    );

    const [payload, signature] = token.split(".");
    const tamperedToken = `${payload}.${signature.slice(0, -1)}x`;

    expect(() => verifyDeliveryQuoteToken(tamperedToken)).toThrow("Invalid delivery quote token.");
  });
});
