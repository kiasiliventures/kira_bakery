import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PesapalInitiationRejectedError } from "@/lib/payments/providers/pesapal";
import { getCheckoutMinimumDateValue } from "@/lib/validation";

const validateSameOriginMutationMock = vi.fn();
const enforceRateLimitMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();
const getOrderAccessTokenMock = vi.fn();
const getOrderPaymentSnapshotMock = vi.fn();
const initiateOrderPaymentForOrderMock = vi.fn();
const cancelRejectedOrderPaymentInitiationMock = vi.fn();
const setOrderAccessCookieMock = vi.fn();
const logSecurityEventMock = vi.fn();

vi.mock("@/lib/http/same-origin", () => ({
  validateSameOriginMutation: validateSameOriginMutationMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
  getAuthenticatedUser: getAuthenticatedUserMock,
}));

vi.mock("@/lib/payments/order-payments", () => ({
  cancelRejectedOrderPaymentInitiation: cancelRejectedOrderPaymentInitiationMock,
  getOrderAccessToken: getOrderAccessTokenMock,
  getOrderPaymentSnapshot: getOrderPaymentSnapshotMock,
  initiateOrderPaymentForOrder: initiateOrderPaymentForOrderMock,
  PAYMENT_INITIATION_PENDING_VERIFICATION_ERROR:
    "Order payment initiation is pending verification.",
}));

vi.mock("@/lib/payments/order-access-cookie", () => ({
  setOrderAccessCookie: setOrderAccessCookieMock,
}));

vi.mock("@/lib/delivery/quote-token", () => ({
  verifyDeliveryQuoteToken: vi.fn(),
}));

vi.mock("@/lib/observability/security-events", () => ({
  logSecurityEvent: logSecurityEventMock,
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

function shiftCheckoutDateValue(dateValue: string, offsetDays: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + offsetDays);
  return utcDate.toISOString().slice(0, 10);
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

function buildCheckoutValidationOnlySupabaseClient(input: {
  productsData?: Array<Record<string, unknown>>;
  productsError?: { code?: string; message: string } | null;
}) {
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
                data: input.productsData ?? null,
                error: input.productsError ?? null,
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table access in test: ${table}`);
    },
  };
}

function buildCheckoutExecutionSupabaseClient(input: {
  productsData: Array<Record<string, unknown>>;
  productsError?: { code?: string; message: string } | null;
  onPlaceGuestOrder?: (payload: Record<string, unknown>) => void;
}) {
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
          insert: async () => ({
            error: null,
          }),
          update() {
            return {
              eq: async () => ({
                error: null,
              }),
            };
          },
          delete() {
            return {
              eq: async () => ({
                error: null,
              }),
            };
          },
        };
      }

      if (table === "products") {
        return {
          select() {
            return {
              in: async () => ({
                data: input.productsData,
                error: input.productsError ?? null,
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table access in test: ${table}`);
    },
    rpc(functionName: string, payload: Record<string, unknown>) {
      if (functionName !== "place_guest_order") {
        throw new Error(`Unexpected RPC access in test: ${functionName}`);
      }

      input.onPlaceGuestOrder?.(payload);

      return Promise.resolve({
        error: null,
      });
    },
  };
}

describe("checkout route regression tests", () => {
  beforeEach(() => {
    vi.resetModules();
    validateSameOriginMutationMock.mockReset();
    enforceRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 60,
    });
    validateSameOriginMutationMock.mockReturnValue(null);
    getAuthenticatedUserMock.mockResolvedValue(null);
    setOrderAccessCookieMock.mockReset();
    getOrderAccessTokenMock.mockReset();
    getOrderPaymentSnapshotMock.mockReset();
    initiateOrderPaymentForOrderMock.mockReset();
    cancelRejectedOrderPaymentInitiationMock.mockReset();
    logSecurityEventMock.mockReset();
    initiateOrderPaymentForOrderMock.mockResolvedValue({
      redirectUrl: "https://payments.example/redirect",
      paymentStatus: "pending",
    });
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
    validateSameOriginMutationMock.mockReturnValueOnce(
      NextResponse.json({ message: "Cross-site mutation request rejected." }, { status: 403 }),
    );

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

  it("cancels the order when Pesapal explicitly rejects initiation without tracking details", async () => {
    getSupabaseServerClientMock.mockReturnValue(
      buildCheckoutExecutionSupabaseClient({
        productsData: [
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
      }),
    );
    initiateOrderPaymentForOrderMock.mockRejectedValue(
      new PesapalInitiationRejectedError({
        code: "maximum_amount_limit_exceeded",
        providerStatus: "500",
        providerMessage: "Request Declined.Maximum allowed test transactions limit exceeded",
        rawResponse: {
          status: "500",
          error: {
            code: "maximum_amount_limit_exceeded",
            message: "Request Declined.Maximum allowed test transactions limit exceeded",
          },
        },
      }),
    );
    cancelRejectedOrderPaymentInitiationMock.mockResolvedValue({
      orderId: "ignored",
      customerName: "Jane Doe",
      orderStatus: "Cancelled",
      totalUGX: 4500,
      paymentStatus: "cancelled",
      viewState: "cancelled",
      verified: false,
      items: [],
    });

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-explicit-reject",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify(buildValidPayload()),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        id: expect.any(String),
        paymentStatus: "cancelled",
      }),
    );
    expect(cancelRejectedOrderPaymentInitiationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: expect.any(String),
        provider: "pesapal",
        reasonCode: "maximum_amount_limit_exceeded",
        reasonMessage: "Request Declined.Maximum allowed test transactions limit exceeded",
      }),
    );
    expect(setOrderAccessCookieMock).toHaveBeenCalledTimes(1);
  });

  it("does not auto-cancel the order when initiation fails ambiguously", async () => {
    getSupabaseServerClientMock.mockReturnValue(
      buildCheckoutExecutionSupabaseClient({
        productsData: [
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
      }),
    );
    initiateOrderPaymentForOrderMock.mockRejectedValue(new Error("socket timeout"));

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-ambiguous-failure",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify(buildValidPayload()),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to initiate payment.",
    });
    expect(cancelRejectedOrderPaymentInitiationMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate cart lines that exceed stock in aggregate", async () => {
    getSupabaseServerClientMock.mockReturnValue(
      buildCheckoutValidationOnlySupabaseClient({
        productsData: [
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
      }),
    );

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
    getSupabaseServerClientMock.mockReturnValue(
      buildCheckoutValidationOnlySupabaseClient({
        productsData: [
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
      }),
    );

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

  it("rejects delivery dates in the past before any order can be created", async () => {
    const pastDeliveryDate = shiftCheckoutDateValue(getCheckoutMinimumDateValue(), -1);

    getSupabaseServerClientMock.mockReturnValue(
      buildCheckoutValidationOnlySupabaseClient({
        productsData: [
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
      }),
    );

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-5b",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          customer: {
            deliveryMethod: "delivery",
            customerName: "Jane Doe",
            phone: "+256700000000",
            email: "",
            address: "Kira Town, Uganda",
            deliveryDate: pastDeliveryDate,
            notes: "",
            deliveryLocation: {
              placeId: "place-1",
              addressText: "Kira Town, Uganda",
              latitude: 0.4,
              longitude: 32.6,
            },
            deliveryQuoteToken: "quote-token",
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
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: "Invalid checkout payload",
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: "Choose today or a future date",
            path: "customer.deliveryDate",
          }),
        ]),
      }),
    );
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
    expect(initiateOrderPaymentForOrderMock).not.toHaveBeenCalled();
    expect(setOrderAccessCookieMock).not.toHaveBeenCalled();
  });

  it("aggregates duplicate cart lines before persisting the order", async () => {
    let placedOrderPayload: Record<string, unknown> | null = null;

    getSupabaseServerClientMock.mockReturnValue(
      buildCheckoutExecutionSupabaseClient({
        productsData: [
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
        onPlaceGuestOrder(payload) {
          placedOrderPayload = payload;
        },
      }),
    );

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-6",
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
            {
              productId: "product-1",
              quantity: 2,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(placedOrderPayload).toEqual(
      expect.objectContaining({
        order_items: [
          expect.objectContaining({
            product_id: "product-1",
            quantity: 3,
            price_ugx: 4500,
          }),
        ],
        order_total_ugx: 13500,
      }),
    );
    expect(initiateOrderPaymentForOrderMock).toHaveBeenCalledTimes(1);
    expect(setOrderAccessCookieMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unexpected client-submitted item pricing fields", async () => {
    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-7",
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
              priceUGX: 1,
              name: "Cheap Bread",
              image: "/fake.jpg",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: "Invalid checkout payload",
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: "Unrecognized keys: \"priceUGX\", \"name\", \"image\"",
            path: "items.0",
          }),
        ]),
      }),
    );
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when the shared checkout schema is unavailable", async () => {
    getSupabaseServerClientMock.mockReturnValue(
      buildCheckoutValidationOnlySupabaseClient({
        productsError: {
          code: "42703",
          message: "column products.base_price does not exist",
        },
      }),
    );

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-8",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify(buildValidPayload()),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to validate cart items.",
    });
    expect(initiateOrderPaymentForOrderMock).not.toHaveBeenCalled();
    expect(setOrderAccessCookieMock).not.toHaveBeenCalled();
  });

  it("rejects carts that exceed the maximum item count", async () => {
    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-9",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          customer: buildValidPayload().customer,
          items: Array.from({ length: 26 }, (_, index) => ({
            productId: `product-${index + 1}`,
            quantity: 1,
          })),
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: "Invalid checkout payload",
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: "Cart cannot contain more than 25 items",
            path: "items",
          }),
        ]),
      }),
    );
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects oversized customer fields before cart validation", async () => {
    const payload = buildValidPayload();
    payload.customer.customerName = "J".repeat(81);

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-10",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: "Invalid checkout payload",
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: "Keep your name under 80 characters",
            path: "customer.customerName",
          }),
        ]),
      }),
    );
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects oversized option strings", async () => {
    const payload = buildValidPayload();
    payload.items = [
      {
        productId: "product-1",
        quantity: 1,
        selectedSize: "L".repeat(81),
      },
    ];

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-11",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: "Invalid checkout payload",
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: "Keep selected size under 80 characters",
            path: "items.0.selectedSize",
          }),
        ]),
      }),
    );
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects unknown top-level checkout payload fields", async () => {
    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-11b",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          ...buildValidPayload(),
          couponCode: "FREEBREAD",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: "Invalid checkout payload",
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: "Unrecognized key: \"couponCode\"",
            path: "",
          }),
        ]),
      }),
    );
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects unknown nested checkout item fields", async () => {
    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-11c",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          ...buildValidPayload(),
          items: [
            {
              productId: "product-1",
              quantity: 1,
              discount: 500,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: "Invalid checkout payload",
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: "Unrecognized key: \"discount\"",
            path: "items.0",
          }),
        ]),
      }),
    );
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects checkout bodies that exceed the request size limit", async () => {
    const payload = {
      ...buildValidPayload(),
      padding: "x".repeat(17_000),
    };

    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "checkout-key-12",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: "Checkout payload is too large.",
    });
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
    expect(initiateOrderPaymentForOrderMock).not.toHaveBeenCalled();
  });

  it("rejects oversized checkout requests from Content-Length before reading the body", async () => {
    const { POST } = await import("@/app/api/checkout/route");

    const response = await POST(
      new Request("https://example.com/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "17000",
          "Idempotency-Key": "checkout-key-12b",
          "X-Checkout-Session": "session-token",
          Origin: "https://example.com",
        },
        body: JSON.stringify(buildValidPayload()),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: "Checkout payload is too large.",
    });
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
    expect(initiateOrderPaymentForOrderMock).not.toHaveBeenCalled();
  });
});
