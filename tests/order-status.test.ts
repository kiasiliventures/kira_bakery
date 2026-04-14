import { describe, expect, it } from "vitest";
import {
  formatPaymentStatusLabel,
  normalizeOrderStatusLabel,
  normalizePaymentStatusValue,
} from "@/lib/orders/status";

describe("order status normalization", () => {
  it("maps unpaid orders to Pending Payment", () => {
    expect(normalizeOrderStatusLabel("Pending", "unpaid")).toBe("Pending Payment");
  });

  it("maps paid payment states to Paid", () => {
    expect(normalizeOrderStatusLabel("pending_payment", "paid")).toBe("Paid");
  });

  it("maps ready and completed states directly", () => {
    expect(normalizeOrderStatusLabel("ready", "paid")).toBe("Ready");
    expect(normalizeOrderStatusLabel("completed", "paid")).toBe("Completed");
  });

  it("maps failed and cancelled payment outcomes correctly", () => {
    expect(normalizeOrderStatusLabel("pending_payment", "payment_failed")).toBe("Payment Failed");
    expect(normalizeOrderStatusLabel("pending_payment", "cancelled")).toBe("Cancelled");
  });

  it("normalizes payment values consistently", () => {
    expect(normalizePaymentStatusValue("completed")).toBe("paid");
    expect(normalizePaymentStatusValue("reversed")).toBe("failed");
    expect(normalizePaymentStatusValue("invalid")).toBe("pending");
    expect(normalizePaymentStatusValue("unpaid")).toBe("pending");
  });

  it("formats payment labels for customer-facing display", () => {
    expect(formatPaymentStatusLabel("paid")).toBe("Paid");
    expect(formatPaymentStatusLabel("payment_failed")).toBe("Payment Failed");
    expect(formatPaymentStatusLabel("cancelled")).toBe("Cancelled");
    expect(formatPaymentStatusLabel("unpaid")).toBe("Pending");
  });
});
