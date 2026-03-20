import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceRateLimitMock = vi.fn();
const getOrderAccessCookieMock = vi.fn();
const getOrderPaymentSnapshotMock = vi.fn();
const initiateOrderPaymentForOrderMock = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock("@/lib/payments/order-access-cookie", () => ({
  getOrderAccessCookie: getOrderAccessCookieMock,
}));

vi.mock("@/lib/payments/order-payments", () => ({
  getOrderPaymentSnapshot: getOrderPaymentSnapshotMock,
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
});
