export const ORDER_STATUSES = [
  "Pending Payment",
  "Paid",
  "Ready",
  "Completed",
  "Payment Failed",
  "Cancelled",
] as const;

export type CanonicalOrderStatus = (typeof ORDER_STATUSES)[number];
export type CanonicalPaymentStatus = "pending" | "paid" | "failed" | "cancelled";

export function normalizePaymentStatusValue(
  paymentStatus: string | null | undefined,
): CanonicalPaymentStatus {
  const normalized = paymentStatus?.trim().toLowerCase();

  if (normalized === "paid" || normalized === "completed") {
    return "paid";
  }

  if (
    normalized === "failed"
    || normalized === "payment_failed"
    || normalized === "reversed"
  ) {
    return "failed";
  }

  if (
    normalized === "cancelled"
    || normalized === "canceled"
  ) {
    return "cancelled";
  }

  return "pending";
}

export function normalizeOrderStatusLabel(
  status: string | null | undefined,
  paymentStatus: string | null | undefined,
): CanonicalOrderStatus {
  const normalizedStatus = status?.trim().toLowerCase();
  const normalizedPaymentStatus = normalizePaymentStatusValue(paymentStatus);

  if (normalizedStatus === "completed" || normalizedStatus === "delivered") {
    return "Completed";
  }

  if (normalizedStatus === "ready" || normalizedStatus === "ready_for_pickup") {
    return "Ready";
  }

  if (normalizedStatus === "cancelled" || normalizedPaymentStatus === "cancelled") {
    return "Cancelled";
  }

  if (
    normalizedStatus === "payment failed"
    || normalizedStatus === "payment_failed"
    || normalizedStatus === "failed"
    || normalizedPaymentStatus === "failed"
  ) {
    return "Payment Failed";
  }

  if (
    normalizedStatus === "paid"
    || normalizedStatus === "approved"
    || normalizedStatus === "in progress"
    || normalizedStatus === "preparing"
    || normalizedStatus === "out_for_delivery"
    || normalizedPaymentStatus === "paid"
  ) {
    return "Paid";
  }

  return "Pending Payment";
}

export function formatPaymentStatusLabel(
  paymentStatus: string | null | undefined,
): string {
  const normalized = normalizePaymentStatusValue(paymentStatus);
  if (normalized === "paid") return "Paid";
  if (normalized === "failed") return "Payment Failed";
  if (normalized === "cancelled") return "Cancelled";
  return "Pending";
}
