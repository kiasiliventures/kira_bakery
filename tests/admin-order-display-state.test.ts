import { describe, expect, it } from "vitest";
import {
  deriveAdminDisplayOrderStatus,
  isAdminOrderBlockedForReview,
} from "../../kira-bakery-admin/src/lib/order-display-state";

describe("admin order display state", () => {
  it("shows a stock-conflict warning state for paid orders with inventory conflicts", () => {
    expect(
      deriveAdminDisplayOrderStatus({
        status: "Paid",
        paymentStatus: "paid",
        fulfillmentReviewRequired: true,
        inventoryConflict: true,
      }),
    ).toBe("Paid - Stock Conflict");
  });

  it("shows a needs-review warning state for paid orders without an inventory conflict", () => {
    expect(
      deriveAdminDisplayOrderStatus({
        status: "Paid",
        paymentStatus: "paid",
        fulfillmentReviewRequired: true,
        inventoryConflict: false,
      }),
    ).toBe("Paid - Needs Review");
  });

  it("blocks ready-transition actions for warning states but not normal paid orders", () => {
    expect(isAdminOrderBlockedForReview("Paid - Stock Conflict")).toBe(true);
    expect(isAdminOrderBlockedForReview("Paid - Needs Review")).toBe(true);
    expect(isAdminOrderBlockedForReview("Paid")).toBe(false);
  });
});
