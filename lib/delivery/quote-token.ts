import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryQuote } from "@/lib/delivery/types";

type DeliveryQuoteTokenSource = Omit<DeliveryQuote, "quoteToken">;

type DeliveryQuoteTokenPayload = {
  destination: DeliveryQuoteTokenSource["destination"];
  distanceKm: number;
  expiresAt: string;
  pricingConfigId: string;
  deliveryFee: number;
  storeLocationId: string;
};

const DELIVERY_QUOTE_TOKEN_TTL_MS = 1000 * 60 * 15;

function getDeliveryQuoteTokenSecret() {
  const secret = process.env.DELIVERY_QUOTE_TOKEN_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return "dev-delivery-quote-token-secret";
  }

  throw new Error("Missing required environment variable: DELIVERY_QUOTE_TOKEN_SECRET");
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getDeliveryQuoteTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function toTokenPayload(quote: DeliveryQuoteTokenSource): DeliveryQuoteTokenPayload {
  return {
    destination: quote.destination,
    distanceKm: quote.distanceKm,
    expiresAt: new Date(Date.now() + DELIVERY_QUOTE_TOKEN_TTL_MS).toISOString(),
    pricingConfigId: quote.pricingConfigId,
    deliveryFee: quote.deliveryFee,
    storeLocationId: quote.storeLocationId,
  };
}

export function createDeliveryQuoteToken(quote: DeliveryQuoteTokenSource) {
  const payload = toTokenPayload(quote);
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyDeliveryQuoteToken(token: string): DeliveryQuoteTokenPayload {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid delivery quote token.");
  }

  const expectedSignature = signPayload(encodedPayload);
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    providedBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid delivery quote token.");
  }

  const parsed = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<DeliveryQuoteTokenPayload>;
  if (
    !parsed
    || typeof parsed.distanceKm !== "number"
    || typeof parsed.deliveryFee !== "number"
    || typeof parsed.pricingConfigId !== "string"
    || typeof parsed.storeLocationId !== "string"
    || typeof parsed.expiresAt !== "string"
    || typeof parsed.destination?.placeId !== "string"
    || typeof parsed.destination?.addressText !== "string"
    || typeof parsed.destination?.latitude !== "number"
    || typeof parsed.destination?.longitude !== "number"
  ) {
    throw new Error("Invalid delivery quote token.");
  }

  if (Date.parse(parsed.expiresAt) <= Date.now()) {
    throw new Error("Delivery quote has expired.");
  }

  return parsed as DeliveryQuoteTokenPayload;
}
