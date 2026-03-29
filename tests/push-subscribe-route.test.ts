import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateSameOriginMutationMock = vi.fn();
const enforceRateLimitMock = vi.fn();
const getOrderAccessCookieMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();
const ordersMaybeSingleMock = vi.fn();
const pushSubscriptionsUpsertMock = vi.fn();
const pushSubscriptionsSingleMock = vi.fn();
const pushSubscriptionOrdersUpsertMock = vi.fn();

vi.mock("@/lib/http/same-origin", () => ({
  validateSameOriginMutation: validateSameOriginMutationMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock("@/lib/payments/order-access-cookie", () => ({
  getOrderAccessCookie: getOrderAccessCookieMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUser: getAuthenticatedUserMock,
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

function createSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: ordersMaybeSingleMock,
            })),
          })),
        };
      }

      if (table === "push_subscriptions") {
        return {
          upsert: pushSubscriptionsUpsertMock,
        };
      }

      if (table === "push_subscription_orders") {
        return {
          upsert: pushSubscriptionOrdersUpsertMock,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("push subscribe route", () => {
  beforeEach(() => {
    vi.resetModules();
    validateSameOriginMutationMock.mockReset();
    enforceRateLimitMock.mockReset();
    getOrderAccessCookieMock.mockReset();
    getAuthenticatedUserMock.mockReset();
    getSupabaseServerClientMock.mockReset();
    ordersMaybeSingleMock.mockReset();
    pushSubscriptionsUpsertMock.mockReset();
    pushSubscriptionsSingleMock.mockReset();
    pushSubscriptionOrdersUpsertMock.mockReset();

    validateSameOriginMutationMock.mockReturnValue(null);
    enforceRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 60,
    });
    getAuthenticatedUserMock.mockResolvedValue(null);
    getSupabaseServerClientMock.mockReturnValue(createSupabaseMock());
    pushSubscriptionsUpsertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: pushSubscriptionsSingleMock,
      })),
    });
    pushSubscriptionsSingleMock.mockResolvedValue({
      data: {
        id: "subscription-123",
      },
      error: null,
    });
    pushSubscriptionOrdersUpsertMock.mockResolvedValue({
      error: null,
    });
  });

  it("rejects cross-site subscription requests before privileged work", async () => {
    validateSameOriginMutationMock.mockReturnValueOnce(
      NextResponse.json({ message: "Cross-site mutation request rejected." }, { status: 403 }),
    );

    const { POST } = await import("@/app/api/push/subscribe/route");

    const response = await POST(
      new Request("https://example.com/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify({
          endpoint: "https://push.example/subscriptions/abc",
          keys: {
            p256dh: "p256dh-key",
            auth: "auth-key",
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Cross-site mutation request rejected.",
    });
    expect(enforceRateLimitMock).not.toHaveBeenCalled();
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("rate limits push subscribe requests before privileged reads", async () => {
    enforceRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 45,
    });

    const { POST } = await import("@/app/api/push/subscribe/route");

    const response = await POST(
      new Request("https://example.com/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          endpoint: "https://push.example/subscriptions/abc",
          keys: {
            p256dh: "p256dh-key",
            auth: "auth-key",
          },
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("45");
    await expect(response.json()).resolves.toEqual({
      message: "Too many requests. Please wait and try again.",
    });
    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("keeps user_id null when order access is proven without account ownership", async () => {
    getOrderAccessCookieMock.mockResolvedValue("guest-order-token");
    ordersMaybeSingleMock.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        customer_id: "customer-123",
        order_access_token: "guest-order-token",
      },
      error: null,
    });

    const { POST } = await import("@/app/api/push/subscribe/route");

    const response = await POST(
      new Request("https://example.com/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify({
          orderId: "11111111-1111-4111-8111-111111111111",
          endpoint: "https://push.example/subscriptions/abc",
          keys: {
            p256dh: "p256dh-key",
            auth: "auth-key",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(enforceRateLimitMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Request),
      "push-subscribe",
      10,
      60_000,
    );
    expect(enforceRateLimitMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Request),
      "push-subscribe-order:11111111-1111-4111-8111-111111111111",
      6,
      60_000,
    );
    expect(pushSubscriptionsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://push.example/subscriptions/abc",
        user_id: null,
      }),
      { onConflict: "endpoint" },
    );
    expect(pushSubscriptionOrdersUpsertMock).toHaveBeenCalledWith(
      {
        subscription_id: "subscription-123",
        order_id: "11111111-1111-4111-8111-111111111111",
      },
      {
        onConflict: "subscription_id,order_id",
        ignoreDuplicates: true,
      },
    );
  });

  it("keeps user-level linkage only for the authenticated order owner", async () => {
    getAuthenticatedUserMock.mockResolvedValue({
      id: "customer-123",
    });
    ordersMaybeSingleMock.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        customer_id: "customer-123",
        order_access_token: "stored-token",
      },
      error: null,
    });

    const { POST } = await import("@/app/api/push/subscribe/route");

    const response = await POST(
      new Request("https://example.com/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify({
          orderId: "11111111-1111-4111-8111-111111111111",
          endpoint: "https://push.example/subscriptions/owner",
          keys: {
            p256dh: "p256dh-key",
            auth: "auth-key",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(pushSubscriptionsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://push.example/subscriptions/owner",
        user_id: "customer-123",
      }),
      { onConflict: "endpoint" },
    );
  });
});
