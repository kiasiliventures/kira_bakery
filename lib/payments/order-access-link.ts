import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type OrderAccessLinkTokenPayload = {
  orderId: string;
  expiresAt: string;
};

const ORDER_ACCESS_LINK_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function getOrderAccessLinkSecret() {
  const secret = process.env.ORDER_ACCESS_LINK_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return "dev-order-access-link-secret";
  }

  throw new Error("Missing required environment variable: ORDER_ACCESS_LINK_SECRET");
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signOrderAccessLinkPayload(encodedPayload: string, accessToken: string) {
  return createHmac("sha256", getOrderAccessLinkSecret())
    .update(`${encodedPayload}.${accessToken}`)
    .digest("base64url");
}

export function createOrderAccessLinkToken(input: {
  orderId: string;
  accessToken: string;
  now?: number;
}) {
  const payload: OrderAccessLinkTokenPayload = {
    orderId: input.orderId,
    expiresAt: new Date((input.now ?? Date.now()) + ORDER_ACCESS_LINK_TOKEN_TTL_MS).toISOString(),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signOrderAccessLinkPayload(encodedPayload, input.accessToken);
  return `${encodedPayload}.${signature}`;
}

export function verifyOrderAccessLinkToken(input: {
  token: string;
  orderId: string;
  accessToken: string;
  now?: number;
}) {
  const [encodedPayload, signature] = input.token.split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = signOrderAccessLinkPayload(encodedPayload, input.accessToken);
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    providedBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return false;
  }

  let parsed: Partial<OrderAccessLinkTokenPayload>;

  try {
    parsed = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<OrderAccessLinkTokenPayload>;
  } catch {
    return false;
  }

  if (!parsed || typeof parsed.orderId !== "string" || typeof parsed.expiresAt !== "string") {
    return false;
  }

  if (parsed.orderId !== input.orderId) {
    return false;
  }

  if (Date.parse(parsed.expiresAt) <= (input.now ?? Date.now())) {
    return false;
  }

  return true;
}
