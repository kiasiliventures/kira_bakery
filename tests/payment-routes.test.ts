import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceRateLimitMock = vi.fn();
const getOrderAccessCookieMock = vi.fn();
const setOrderAccessCookieMock = vi.fn();
const verifyOrderAccessLinkTokenMock = vi.fn();
const getOrderPaymentSnapshotMock = vi.fn();
const getOrderAccessTokenMock = vi.fn();
const initiateOrderPaymentForOrderMock = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock("@/lib/payments/order-access-cookie", () => ({
  getOrderAccessCookie: getOrderAccessCookieMock,
  setOrderAccessCookie: setOrderAccessCookieMock,
}));

vi.mock("@/lib/payments/order-access-link", () => ({
  verifyOrderAccessLinkToken: verifyOrderAccessLinkTokenMock,
}));

vi.mock("@/lib/payments/order-payments", () => ({
  getOrderPaymentSnapshot: getOrderPaymentSnapshotMock,
  getOrderAccessToken: getOrderAccessTokenMock,
  initiateOrderPaymentForOrder: initiateOrderPaymentForOrderMock,
  isOrderAccessDeniedError: vi.fn(() => false),
}));

describe("payment route regression tests", () => {
  beforeEach(() => {
    enforceRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 60,
    });
    getOrderAccessCookieMock.mockReset();
    setOrderAccessCookieMock.mockReset();
    verifyOrderAccessLinkTokenMock.mockReset();
    getOrderPaymentSnapshotMock.mockReset();
    getOrderAccessTokenMock.mockReset();
    initiateOrderPaymentForOrderMock.mockReset();
  });

  it("blocks payment status checks without an order access session", async () => {
    getOrderAccessCookieMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/payments/pesapal/status/route");

    const response = await GET(
      new Request("https://example.com/api/payments/pesapal/status?orderId=order-123"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Missing order access session.",
    });
    expect(getOrderPaymentSnapshotMock).not.toHaveBeenCalled();
  });

  it("blocks payment initiation without an order access session", async () => {
    getOrderAccessCookieMock.mockResolvedValue(null);

    const { POST } = await import("@/app/api/payments/pesapal/initiate/route");

    const response = await POST(
      new Request("https://example.com/api/payments/pesapal/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          orderId: "order-123",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Missing order access session.",
    });
    expect(initiateOrderPaymentForOrderMock).not.toHaveBeenCalled();
  });

  it("allows payment status checks with a valid signed access link and refreshes the cookie", async () => {
    getOrderAccessCookieMock.mockResolvedValue(null);
    getOrderAccessTokenMock.mockResolvedValue("stored-order-access-token");
    verifyOrderAccessLinkTokenMock.mockReturnValue(true);
    getOrderPaymentSnapshotMock.mockResolvedValue({
      orderId: "order-123",
      customerName: "Jane Doe",
      orderStatus: "Paid",
      totalUGX: 120000,
      paymentStatus: "paid",
      viewState: "success",
      verified: true,
      items: [],
    });

    const { GET } = await import("@/app/api/payments/pesapal/status/route");

    const response = await GET(
      new Request("https://example.com/api/payments/pesapal/status?orderId=order-123&access=signed-token"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      order: expect.objectContaining({
        orderId: "order-123",
        paymentStatus: "paid",
      }),
    });
    expect(verifyOrderAccessLinkTokenMock).toHaveBeenCalledWith({
      token: "signed-token",
      orderId: "order-123",
      accessToken: "stored-order-access-token",
    });
    expect(getOrderPaymentSnapshotMock).toHaveBeenCalledWith("order-123", {
      refresh: true,
      hint: undefined,
      accessToken: "stored-order-access-token",
      requireAccessToken: true,
    });
    expect(setOrderAccessCookieMock).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-site payment initiation requests", async () => {
    const { POST } = await import("@/app/api/payments/pesapal/initiate/route");

    const response = await POST(
      new Request("https://example.com/api/payments/pesapal/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify({
          orderId: "order-123",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Cross-site mutation request rejected.",
    });
    expect(initiateOrderPaymentForOrderMock).not.toHaveBeenCalled();
  });

  it("returns conflict when trying to re-initiate a cancelled order", async () => {
    getOrderAccessCookieMock.mockResolvedValue("access-token");
    initiateOrderPaymentForOrderMock.mockRejectedValue(new Error("Order payment has been cancelled."));

    const { POST } = await import("@/app/api/payments/pesapal/initiate/route");

    const response = await POST(
      new Request("https://example.com/api/payments/pesapal/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          orderId: "order-123",
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Order payment has been cancelled.",
    });
  });
});
