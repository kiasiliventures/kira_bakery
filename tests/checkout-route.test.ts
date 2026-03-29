import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceRateLimitMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();
const getOrderAccessTokenMock = vi.fn();
const setOrderAccessCookieMock = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
  getAuthenticatedUser: getAuthenticatedUserMock,
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

function normalizeOptionalSelection(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildRequestedCheckoutItemKey(item: {
  productId: string;
  selectedSize?: string;
  selectedFlavor?: string;
}) {
  return `${item.productId}::${normalizeOptionalSelection(item.selectedSize) ?? ""}::${normalizeOptionalSelection(item.selectedFlavor) ?? ""}`;
}

function normalizeCheckoutPayload(payload: ReturnType<typeof buildValidPayload>) {
  const itemsByKey = new Map<
    string,
    {
      productId: string;
      quantity: number;
      selectedSize?: string | undefined;
      selectedFlavor?: string | undefined;
    }
  >();

  for (const item of payload.items as Array<{
    productId: string;
    quantity: number;
    selectedSize?: string;
    selectedFlavor?: string;
  }>) {
    const normalizedItem = {
      productId: item.productId,
      quantity: item.quantity,
      selectedSize: normalizeOptionalSelection(item.selectedSize),
      selectedFlavor: normalizeOptionalSelection(item.selectedFlavor),
    };
    const key = buildRequestedCheckoutItemKey(normalizedItem);
    const existing = itemsByKey.get(key);

    if (existing) {
      existing.quantity += normalizedItem.quantity;
      continue;
    }

    itemsByKey.set(key, normalizedItem);
  }

  return {
    customer: payload.customer,
    items: [...itemsByKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, item]) => item),
  };
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

function buildStockValidationSupabaseClient() {
  return {
    from(table: string) {
      if (table === "api_idempotency_keys") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: null,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "products") {
        return {
          select() {
            return {
              in: async () => ({
                data: [
                  {
                    id: "product-1",
                    name: "Milk Bread",
                    image_url: "/bread.jpg",
                    base_price: 4500,
                    stock_quantity: 5,
                    is_available: true,
                    is_published: true,
                  },
                ],
                error: null,
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table access in test: ${table}`);
    },
  };
}

function buildUnpublishedProductSupabaseClient() {
  return {
    from(table: string) {
      if (table === "api_idempotency_keys") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: null,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "products") {
        return {
          select() {
            return {
              in: async () => ({
                data: [
                  {
                    id: "product-1",
                    name: "Secret Cake",
                    image_url: "/secret-cake.jpg",
                    base_price: 45000,
                    stock_quantity: 5,
                    is_available: true,
                    is_published: false,
                  },
                ],
                error: null,
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table access in test: ${table}`);
    },
  };
}

describe("checkout route regression tests", () => {
  beforeEach(() => {
    enforceRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 60,
    });
    getAuthenticatedUserMock.mockResolvedValue(null);
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
        request_hash: buildCheckoutRequestHash(normalizeCheckoutPayload(payload)),
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
          Origin: "https://example.com",
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
        request_hash: buildCheckoutRequestHash(normalizeCheckoutPayload(payload)),
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
          Origin: "https://example.com",
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

  it("rejects cross-site checkout requests before processing", async () => {
    const payload = buildValidPayload();

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-3",
          "X-Checkout-Session": "session-token",
          Origin: "https://evil.example",
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Cross-site mutation request rejected.",
    });
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
    expect(setOrderAccessCookieMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate cart lines that exceed stock in aggregate", async () => {
    getSupabaseServerClientMock.mockReturnValue(buildStockValidationSupabaseClient());

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-4",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
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
              quantity: 3,
            },
            {
              productId: "product-1",
              quantity: 3,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Only 5 pieces of Milk Bread are left.",
    });
    expect(setOrderAccessCookieMock).not.toHaveBeenCalled();
  });

  it("rejects unpublished products even when they are in stock", async () => {
    getSupabaseServerClientMock.mockReturnValue(buildUnpublishedProductSupabaseClient());

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-5",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
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
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Secret Cake is unavailable.",
    });
    expect(setOrderAccessCookieMock).not.toHaveBeenCalled();
  });
});
