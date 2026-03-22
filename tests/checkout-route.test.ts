import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

const enforceRateLimitMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();
const getOrderAccessTokenMock = vi.fn();
const setOrderAccessCookieMock = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

vi.mock("@/lib/payments/order-payments", () => ({
  getOrderAccessToken: getOrderAccessTokenMock,
  getOrderPaymentSnapshot: vi.fn(),
  initiateOrderPaymentForOrder: vi.fn(),
}));

vi.mock("@/lib/payments/order-access-cookie", () => ({
  setOrderAccessCookie: setOrderAccessCookieMock,
}));

vi.mock("@/lib/delivery/quote-token", () => ({
  verifyDeliveryQuoteToken: vi.fn(),
}));

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildCheckoutRequestHash(payload: unknown) {
  return createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

function buildSessionBindingHash(sessionToken: string) {
  return createHash("sha256").update(sessionToken).digest("hex");
}

function buildValidPayload() {
  return {
    customer: {
      deliveryMethod: "pickup",
      customerName: "Jane Doe",
      phone: "+256700000000",
      email: "",
      address: "",
      deliveryDate: "",
      notes: "",
    },
    items: [
      {
        productId: "product-1",
        quantity: 1,
      },
    ],
  };
}

function buildSupabaseClient(existingAttempt: Record<string, unknown>) {
  return {
    from(table: string) {
      if (table !== "api_idempotency_keys") {
        throw new Error(`Unexpected table access in test: ${table}`);
      }

      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: existingAttempt,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

describe("checkout route regression tests", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    enforceRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 60,
    });
    setOrderAccessCookieMock.mockReset();
    getOrderAccessTokenMock.mockReset();
  });

  it("rejects a stored checkout retry from a different browser session", async () => {
    const payload = buildValidPayload();
    const idempotencyKey = "checkout-key-1";
    const originalSessionToken = "session-token-original";
    const replaySessionToken = "session-token-replay";

    getSupabaseServerClientMock.mockReturnValue(
      buildSupabaseClient({
        key: idempotencyKey,
        endpoint: "checkout",
        request_hash: buildCheckoutRequestHash(payload),
        client_binding_hash: buildSessionBindingHash(originalSessionToken),
        resource_id: "4ecf46c0-17fe-4fba-8fe2-6b58a4c3409f",
        response_status: 200,
        response_body: {
          ok: true,
          id: "4ecf46c0-17fe-4fba-8fe2-6b58a4c3409f",
          paymentStatus: "pending",
        },
      }),
    );

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Checkout-Session": replaySessionToken,
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "This checkout retry belongs to a different browser session. Please start a new checkout.",
    });
    expect(setOrderAccessCookieMock).not.toHaveBeenCalled();
  });

  it("allows a stored checkout retry from the original browser session", async () => {
    const payload = buildValidPayload();
    const idempotencyKey = "checkout-key-2";
    const sessionToken = "session-token-original";
    const orderId = "4ecf46c0-17fe-4fba-8fe2-6b58a4c3409f";

    getSupabaseServerClientMock.mockReturnValue(
      buildSupabaseClient({
        key: idempotencyKey,
        endpoint: "checkout",
        request_hash: buildCheckoutRequestHash(payload),
        client_binding_hash: buildSessionBindingHash(sessionToken),
        resource_id: orderId,
        response_status: 200,
        response_body: {
          ok: true,
          id: orderId,
          paymentStatus: "pending",
        },
      }),
    );
    getOrderAccessTokenMock.mockResolvedValue("order-access-token");

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Checkout-Session": sessionToken,
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: orderId,
      paymentStatus: "pending",
    });
    expect(setOrderAccessCookieMock).toHaveBeenCalledTimes(1);
    expect(setOrderAccessCookieMock).toHaveBeenCalledWith(
      expect.anything(),
      orderId,
      "order-access-token",
    );
  });

  it("allows a stored checkout retry without session binding when the March 20 hardening is muted", async () => {
    process.env.MUTE_MARCH20_PAYMENT_SECURITY_HARDENING = "true";

    const payload = buildValidPayload();
    const idempotencyKey = "checkout-key-3";
    const orderId = "4ecf46c0-17fe-4fba-8fe2-6b58a4c3409f";

    getSupabaseServerClientMock.mockReturnValue(
      buildSupabaseClient({
        key: idempotencyKey,
        endpoint: "checkout",
        request_hash: buildCheckoutRequestHash(payload),
        client_binding_hash: buildSessionBindingHash("different-session"),
        resource_id: orderId,
        response_status: 200,
        response_body: {
          ok: true,
          id: orderId,
          paymentStatus: "pending",
        },
      }),
    );
    getOrderAccessTokenMock.mockResolvedValue("order-access-token");

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: orderId,
      paymentStatus: "pending",
    });
    expect(setOrderAccessCookieMock).toHaveBeenCalledWith(
      expect.anything(),
      orderId,
      "order-access-token",
    );
  });
});
