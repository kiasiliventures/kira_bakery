import { describe, expect, it } from "vitest";
import { buildOrderPath } from "@/lib/orders/order-link";

describe("buildOrderPath", () => {
  it("builds the canonical order path without a guest token", () => {
    expect(buildOrderPath("order-123")).toBe("/orders/order-123");
  });

  it("preserves the signed guest access token in the canonical order path", () => {
    expect(buildOrderPath("order-123", "signed-access-token")).toBe(
      "/orders/order-123?access=signed-access-token",
    );
  });
});
