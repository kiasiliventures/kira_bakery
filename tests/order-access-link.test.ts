import { beforeEach, describe, expect, it, vi } from "vitest";

describe("order access link tokens", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ORDER_ACCESS_LINK_SECRET = "test-order-access-link-secret";
  });

  it("creates and verifies a valid order access link token", async () => {
    const { createOrderAccessLinkToken, verifyOrderAccessLinkToken } = await import(
      "@/lib/payments/order-access-link"
    );

    const token = createOrderAccessLinkToken({
      orderId: "order-123",
      accessToken: "stored-access-token",
      now: Date.parse("2026-03-29T00:00:00.000Z"),
    });

    expect(
      verifyOrderAccessLinkToken({
        token,
        orderId: "order-123",
        accessToken: "stored-access-token",
        now: Date.parse("2026-03-30T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("rejects expired or mismatched order access link tokens", async () => {
    const { createOrderAccessLinkToken, verifyOrderAccessLinkToken } = await import(
      "@/lib/payments/order-access-link"
    );

    const token = createOrderAccessLinkToken({
      orderId: "order-123",
      accessToken: "stored-access-token",
      now: Date.parse("2026-03-29T00:00:00.000Z"),
    });

    expect(
      verifyOrderAccessLinkToken({
        token,
        orderId: "order-999",
        accessToken: "stored-access-token",
        now: Date.parse("2026-03-30T00:00:00.000Z"),
      }),
    ).toBe(false);

    expect(
      verifyOrderAccessLinkToken({
        token,
        orderId: "order-123",
        accessToken: "stored-access-token",
        now: Date.parse("2026-05-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });
});
