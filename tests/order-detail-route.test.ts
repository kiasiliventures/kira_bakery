import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceRateLimitMock = vi.fn();
const getAuthenticatedUserMock = vi.fn();
const getOrderAccessCookieMock = vi.fn();
const setOrderAccessCookieMock = vi.fn();
const verifyOrderAccessLinkTokenMock = vi.fn();
const getOrderAccessTokenMock = vi.fn();
const getOrderDetailSnapshotMock = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUser: getAuthenticatedUserMock,
}));

vi.mock("@/lib/payments/order-access-cookie", () => ({
  getOrderAccessCookie: getOrderAccessCookieMock,
  setOrderAccessCookie: setOrderAccessCookieMock,
}));

vi.mock("@/lib/payments/order-access-link", () => ({
  verifyOrderAccessLinkToken: verifyOrderAccessLinkTokenMock,
}));

vi.mock("@/lib/payments/order-payments", () => ({
  getOrderAccessToken: getOrderAccessTokenMock,
  getOrderDetailSnapshot: getOrderDetailSnapshotMock,
  isOrderAccessDeniedError: vi.fn(() => false),
}));

describe("order detail route", () => {
  beforeEach(() => {
    enforceRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 60,
    });
    getAuthenticatedUserMock.mockResolvedValue(null);
    getOrderAccessCookieMock.mockResolvedValue(null);
    setOrderAccessCookieMock.mockReset();
    verifyOrderAccessLinkTokenMock.mockReset();
    getOrderAccessTokenMock.mockReset();
    getOrderDetailSnapshotMock.mockReset();
  });

  it("blocks guest order detail requests without an access session", async () => {
    const { GET } = await import("@/app/api/orders/[id]/route");

    const response = await GET(
      new Request("https://example.com/api/orders/order-123"),
      { params: Promise.resolve({ id: "order-123" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Missing order access session.",
    });
    expect(getOrderDetailSnapshotMock).not.toHaveBeenCalled();
  });

  it("allows the signed-in order owner to load the canonical order page without a guest token", async () => {
    getAuthenticatedUserMock.mockResolvedValue({
      id: "customer-123",
    });
    getOrderDetailSnapshotMock.mockResolvedValue({
      orderId: "order-123",
      customerName: "Jane Doe",
      orderStatus: "Paid",
      totalUGX: 120000,
      subtotalUGX: 100000,
      deliveryFeeUGX: 20000,
      paymentStatus: "paid",
      paymentStatusLabel: "Paid",
      viewState: "success",
      verified: true,
      fulfillmentMethod: "delivery",
      deliveryAddress: "Kira, Kampala",
      deliveryDate: "2026-03-30",
      notes: null,
      createdAt: "2026-03-29T10:00:00.000Z",
      items: [],
    });

    const { GET } = await import("@/app/api/orders/[id]/route");

    const response = await GET(
      new Request("https://example.com/api/orders/order-123"),
      { params: Promise.resolve({ id: "order-123" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      order: expect.objectContaining({
        orderId: "order-123",
        paymentStatus: "paid",
      }),
    });
    expect(getOrderDetailSnapshotMock).toHaveBeenCalledWith("order-123", {
      refresh: true,
      authenticatedUserId: "customer-123",
      accessToken: null,
      requireAuthorization: true,
    });
    expect(setOrderAccessCookieMock).not.toHaveBeenCalled();
  });

  it("accepts a valid signed guest access link and refreshes the cookie", async () => {
    getOrderAccessTokenMock.mockResolvedValue("stored-order-access-token");
    verifyOrderAccessLinkTokenMock.mockReturnValue(true);
    getOrderDetailSnapshotMock.mockResolvedValue({
      orderId: "order-123",
      customerName: "Jane Doe",
      orderStatus: "Paid",
      totalUGX: 120000,
      subtotalUGX: 120000,
      deliveryFeeUGX: 0,
      paymentStatus: "paid",
      paymentStatusLabel: "Paid",
      viewState: "success",
      verified: true,
      fulfillmentMethod: "pickup",
      deliveryAddress: null,
      deliveryDate: null,
      notes: null,
      createdAt: "2026-03-29T10:00:00.000Z",
      items: [],
    });

    const { GET } = await import("@/app/api/orders/[id]/route");

    const response = await GET(
      new Request("https://example.com/api/orders/order-123?access=signed-token"),
      { params: Promise.resolve({ id: "order-123" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      order: expect.objectContaining({
        orderId: "order-123",
      }),
    });
    expect(verifyOrderAccessLinkTokenMock).toHaveBeenCalledWith({
      token: "signed-token",
      orderId: "order-123",
      accessToken: "stored-order-access-token",
    });
    expect(getOrderDetailSnapshotMock).toHaveBeenCalledWith("order-123", {
      refresh: true,
      authenticatedUserId: null,
      accessToken: "stored-order-access-token",
      requireAuthorization: true,
    });
    expect(setOrderAccessCookieMock).toHaveBeenCalledTimes(1);
  });
});
