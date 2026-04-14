import "server-only";

import { unstable_cache } from "next/cache";
import { captureOperationalIncident } from "@/lib/ops/incidents";
import { logSecurityEvent } from "@/lib/observability/security-events";
import { createOrderAccessLinkToken } from "@/lib/payments/order-access-link";
import {
  formatPaymentStatusLabel,
  normalizeOrderStatusLabel,
} from "@/lib/orders/status";
import { triggerAdminPaidOrderPushDispatch } from "@/lib/push/admin-paid-order";
import { getPaymentProvider, parsePaymentProviderName, type PaymentProviderName } from "@/lib/payments/config";
import {
  getPaymentGateway,
  type PaymentStatus,
  type PaymentSyncSource,
} from "@/lib/payments/gateway";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type OrderPaymentRow = {
  id: string;
  customer_id: string | null;
  order_access_token: string;
  total_ugx: number;
  total_price?: number | null;
  status: string;
  order_status: string | null;
  customer_name: string;
  customer_phone: string | null;
  phone: string | null;
  customer_email: string | null;
  email: string | null;
  payment_status: string | null;
  payment_provider: string | null;
  payment_reference: string | null;
  payment_redirect_url: string | null;
  payment_initiation_failure_code: string | null;
  payment_initiation_failure_message: string | null;
  payment_initiation_failed_at: string | null;
  payment_initiation_attempted_at: string | null;
  payment_last_verified_at: string | null;
  paid_at: string | null;
  order_tracking_id: string | null;
  fulfillment_review_required: boolean | null;
  fulfillment_review_reason: string | null;
  inventory_conflict: boolean | null;
  inventory_deduction_status: string | null;
  inventory_deduction_attempted_at: string | null;
  fulfillment_method: "delivery" | "pickup" | null;
  delivery_method: "delivery" | "pickup" | null;
  address: string | null;
  delivery_address: string | null;
  delivery_address_text: string | null;
  delivery_date: string | null;
  delivery_fee: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderPaymentItemRow[] | null;
};

type OrderPaymentItemRow = {
  name: string;
  price_ugx: number | null;
  quantity: number;
  selected_size: string | null;
  selected_flavor: string | null;
};

type PaymentAttemptRecordInput = {
  orderId: string;
  provider: PaymentProviderName;
  providerReference: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  redirectUrl?: string | null;
  rawProviderResponse?: unknown;
  createdAt?: string;
  verifiedAt?: string | null;
};

type InventoryDeductionAttemptResult = {
  inventory_deduction_status?: string | null;
  fulfillment_review_required?: boolean | null;
  fulfillment_review_reason?: string | null;
  inventory_conflict?: boolean | null;
  reserved_item_count?: number | null;
  conflicted_item_count?: number | null;
};

export type PaymentViewState = "success" | "failed" | "cancelled" | "pending";

export type OrderPaymentSnapshot = {
  orderId: string;
  customerName: string;
  orderStatus: string;
  totalUGX: number;
  paymentStatus: string;
  viewState: PaymentViewState;
  verified: boolean;
  items: Array<{
    name: string;
    quantity: number;
    selectedSize: string | null;
    selectedFlavor: string | null;
  }>;
};

export type OrderDetailSnapshot = {
  orderId: string;
  customerName: string;
  orderStatus: string;
  totalUGX: number;
  subtotalUGX: number;
  deliveryFeeUGX: number;
  paymentStatus: string;
  paymentStatusLabel: string;
  viewState: PaymentViewState;
  verified: boolean;
  fulfillmentMethod: "delivery" | "pickup";
  deliveryAddress: string | null;
  deliveryDate: string | null;
  notes: string | null;
  createdAt: string;
  items: Array<{
    name: string;
    priceUGX: number;
    quantity: number;
    selectedSize: string | null;
    selectedFlavor: string | null;
  }>;
};

export type InitiatedOrderPayment = {
  orderId: string;
  redirectUrl: string;
  paymentStatus: string;
};

export type VerifyOrderPaymentAuthorityOptions = {
  orderId: string;
  orderTrackingId?: string | null;
  merchantReference?: string | null;
  source: PaymentSyncSource;
};

type SyncPaymentInput = VerifyOrderPaymentAuthorityOptions;

type OrderPaymentVerificationRecord = {
  provider: PaymentProviderName;
  providerReference: string;
  providerStatus: string | null;
  paymentReference: string | null;
  rawResponse: unknown;
  verifiedAt: string;
};

type PersistedOrderPaymentVerification = {
  row: OrderPaymentRow;
  updated: boolean;
  justBecamePaid: boolean;
};

export type OrderPaymentAuthorityResult = {
  ok: boolean;
  orderId: string;
  provider: PaymentProviderName;
  verificationState: PaymentStatus;
  providerStatus: string | null;
  stickyPaid: boolean;
  wasAlreadyPaid: boolean;
  isNowPaid: boolean;
  justBecamePaid: boolean;
  amountExpected: number;
  amountReceived: number | null;
  currency: string;
  providerTrackingId: string | null;
  merchantReference: string;
  paymentReference: string | null;
  updated: boolean;
  orderSnapshot: OrderPaymentSnapshot;
  message: string;
};

const PAYMENT_STATUS_REFRESH_REVALIDATE_SECONDS = 15;
const PAYMENT_INITIATION_LEASE_MS = 90_000;
const PENDING_PAYMENT_RECOVERY_SOFT_CANCEL_MS = 7 * 60_000;
const PENDING_PAYMENT_RECOVERY_LOOKBACK_MS = 2 * 60 * 60_000;
const PENDING_PAYMENT_RECOVERY_VERIFY_THROTTLE_MS = 5 * 60_000;
const PENDING_PAYMENT_RECOVERY_SCAN_LIMIT = 12;
const PENDING_PAYMENT_RECOVERY_PROCESS_LIMIT = 2;
const PENDING_PAYMENT_RECOVERY_MIN_RUN_INTERVAL_MS = 30_000;
export const PAYMENT_INITIATION_PENDING_VERIFICATION_ERROR =
  "Order payment initiation is pending verification.";
export type PendingPaymentRecoveryStats = {
  trigger: string;
  scanned: number;
  verified: number;
  cancelled: number;
  skipped: number;
  errors: number;
};
const ORDER_PAYMENT_SELECTION = [
  "id",
  "customer_id",
  "order_access_token",
  "total_ugx",
  "total_price",
  "status",
  "order_status",
  "customer_name",
  "customer_phone",
  "phone",
  "customer_email",
  "email",
  "payment_status",
  "payment_provider",
  "payment_reference",
  "payment_redirect_url",
  "payment_initiation_failure_code",
  "payment_initiation_failure_message",
  "payment_initiation_failed_at",
  "payment_initiation_attempted_at",
  "payment_last_verified_at",
  "paid_at",
  "order_tracking_id",
  "fulfillment_review_required",
  "fulfillment_review_reason",
  "inventory_conflict",
  "inventory_deduction_status",
  "inventory_deduction_attempted_at",
  "fulfillment_method",
  "delivery_method",
  "address",
  "delivery_address",
  "delivery_address_text",
  "delivery_date",
  "delivery_fee",
  "notes",
  "created_at",
  "updated_at",
  "order_items(name,price_ugx,quantity,selected_size,selected_flavor)",
].join(",");
const NOT_ALREADY_PAID_FILTER = [
  "payment_status.is.null",
  "payment_status.eq.unpaid",
  "payment_status.eq.pending",
  "payment_status.eq.failed",
  "payment_status.eq.payment_failed",
  "payment_status.eq.reversed",
  "payment_status.eq.cancelled",
  "payment_status.eq.canceled",
  "payment_status.eq.invalid",
].join(",");
let pendingPaymentRecoveryRunPromise: Promise<PendingPaymentRecoveryStats | null> | null = null;
let pendingPaymentRecoveryLastRunAt = 0;

class OrderAccessDeniedError extends Error {
  constructor() {
    super("Invalid order access token.");
  }
}

function normalizeStoredPaymentStatus(paymentStatus: string | null | undefined): PaymentStatus {
  const normalized = paymentStatus?.trim().toLowerCase();
  if (!normalized || normalized === "unpaid") {
    return "pending";
  }

  if (normalized === "paid" || normalized === "completed") {
    return "paid";
  }

  if (normalized === "failed" || normalized === "payment_failed" || normalized === "reversed") {
    return "failed";
  }

  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }

  return "pending";
}

function mapViewState(
  paymentStatus: string,
  hint?: "cancelled" | "pending",
): PaymentViewState {
  if (paymentStatus === "paid") {
    return "success";
  }
  if (paymentStatus === "failed" || paymentStatus === "payment_failed") {
    return "failed";
  }
  if (paymentStatus === "cancelled") {
    return "cancelled";
  }
  if (hint === "cancelled") {
    return "cancelled";
  }
  return "pending";
}

async function getOrderPaymentRow(orderId: string): Promise<OrderPaymentRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_PAYMENT_SELECTION)
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("order_payment_lookup_failed", { orderId, error: error.message });
    throw new Error("Unable to load order payment details.");
  }

  return (data as OrderPaymentRow | null) ?? null;
}

function buildSnapshot(
  row: OrderPaymentRow,
  options?: {
    verified?: boolean;
    hint?: "cancelled" | "pending";
  },
): OrderPaymentSnapshot {
  const paymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  return {
    orderId: row.id,
    customerName: row.customer_name,
    orderStatus: normalizeOrderStatusLabel(row.order_status ?? row.status, row.payment_status),
    totalUGX: row.total_ugx,
    paymentStatus,
    viewState: mapViewState(paymentStatus, options?.hint),
    verified: options?.verified ?? paymentStatus === "paid",
    items: (row.order_items ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      selectedSize: item.selected_size,
      selectedFlavor: item.selected_flavor,
    })),
  };
}

async function updateOrderPaymentRow(
  orderId: string,
  values: Partial<OrderPaymentRow>,
  options?: {
    onlyIfNotAlreadyPaid?: boolean;
  },
): Promise<OrderPaymentRow | null> {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("orders")
    .update(values)
    .eq("id", orderId);

  if (options?.onlyIfNotAlreadyPaid) {
    query = query.or(NOT_ALREADY_PAID_FILTER);
  }

  const { data, error } = await query
    .select(ORDER_PAYMENT_SELECTION)
    .maybeSingle();

  if (error) {
    console.error("order_payment_update_failed", { orderId, error: error.message });
    throw new Error("Unable to update order payment details.");
  }

  return (data as OrderPaymentRow | null) ?? null;
}

async function claimOrderPaymentInitiation(
  orderId: string,
): Promise<OrderPaymentRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .update({
      payment_initiation_attempted_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .is("order_tracking_id", null)
    .is("payment_redirect_url", null)
    .is("payment_initiation_attempted_at", null)
    .not("payment_status", "in", "(paid,completed,cancelled,canceled)")
    .select(ORDER_PAYMENT_SELECTION)
    .maybeSingle();

  if (error) {
    console.error("order_payment_initiation_claim_failed", {
      orderId,
      error: error.message,
    });
    throw new Error("Unable to claim order payment initiation.");
  }

  return (data as OrderPaymentRow | null) ?? null;
}

function isPaymentInitiationLeaseExpired(attemptedAt: string | null | undefined) {
  if (!attemptedAt) {
    return false;
  }

  const attemptedAtMs = Date.parse(attemptedAt);
  if (Number.isNaN(attemptedAtMs)) {
    return true;
  }

  return Date.now() - attemptedAtMs >= PAYMENT_INITIATION_LEASE_MS;
}

async function releaseStaleOrderPaymentInitiation(
  orderId: string,
  attemptedAt: string,
): Promise<OrderPaymentRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .update({
      payment_initiation_attempted_at: null,
    })
    .eq("id", orderId)
    .eq("payment_initiation_attempted_at", attemptedAt)
    .is("order_tracking_id", null)
    .is("payment_redirect_url", null)
    .not("payment_status", "in", "(paid,completed,cancelled,canceled)")
    .select(ORDER_PAYMENT_SELECTION)
    .maybeSingle();

  if (error) {
    console.error("order_payment_initiation_release_failed", {
      orderId,
      attemptedAt,
      error: error.message,
    });
    throw new Error("Unable to release stale order payment initiation.");
  }

  return (data as OrderPaymentRow | null) ?? null;
}

function hasCanonicalPaymentFieldsChanged(previous: OrderPaymentRow, next: OrderPaymentRow) {
  return (
    previous.payment_status !== next.payment_status
    || previous.payment_provider !== next.payment_provider
    || previous.payment_reference !== next.payment_reference
    || previous.paid_at !== next.paid_at
    || previous.order_tracking_id !== next.order_tracking_id
  );
}

function hasInventoryFulfillmentStateChanged(previous: OrderPaymentRow, next: OrderPaymentRow) {
  return (
    previous.fulfillment_review_required !== next.fulfillment_review_required
    || previous.fulfillment_review_reason !== next.fulfillment_review_reason
    || previous.inventory_conflict !== next.inventory_conflict
    || previous.inventory_deduction_status !== next.inventory_deduction_status
    || previous.inventory_deduction_attempted_at !== next.inventory_deduction_attempted_at
  );
}

async function upsertPaymentAttempt(input: PaymentAttemptRecordInput) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("payment_attempts")
    .upsert(
      {
        order_id: input.orderId,
        provider: input.provider,
        provider_reference: input.providerReference,
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        redirect_url: input.redirectUrl ?? null,
        raw_provider_response: input.rawProviderResponse ?? null,
        created_at: input.createdAt,
        verified_at: input.verifiedAt ?? null,
      },
      {
        onConflict: "provider,provider_reference",
      },
    );

  if (error) {
    console.error("payment_attempt_upsert_failed", {
      orderId: input.orderId,
      provider: input.provider,
      providerReference: input.providerReference,
      error: error.message,
    });
    throw new Error("Unable to persist payment attempt details.");
  }
}

function buildOrderDescription(orderId: string) {
  return `Kira Bakery order ${orderId}`;
}

function resolveConfiguredProviderForInitiation(row: OrderPaymentRow): PaymentProviderName {
  const storedProvider = parsePaymentProviderName(row.payment_provider);
  return storedProvider ?? getPaymentProvider();
}

function resolveProviderForVerification(row: OrderPaymentRow): PaymentProviderName {
  const storedProvider = parsePaymentProviderName(row.payment_provider);
  return storedProvider ?? getPaymentProvider();
}

function resolveVerifiedPaymentStatus(
  currentStatus: PaymentStatus,
  verifiedStatus: PaymentStatus,
): PaymentStatus {
  if (currentStatus === "paid" && verifiedStatus !== "paid") {
    return currentStatus;
  }

  if (verifiedStatus === "paid") {
    return "paid";
  }

  return verifiedStatus;
}

function resolvePaidLifecycleUpdates(row: OrderPaymentRow): Partial<OrderPaymentRow> {
  const nextValues: Partial<OrderPaymentRow> = {};
  const normalizedStatus = row.status?.trim().toLowerCase() ?? "";
  const normalizedOrderStatus = row.order_status?.trim().toLowerCase() ?? "";

  if (normalizedStatus !== "ready" && normalizedStatus !== "completed") {
    nextValues.status = "Paid";
  }

  if (normalizedOrderStatus !== "ready" && normalizedOrderStatus !== "completed") {
    nextValues.order_status = "paid";
  }

  return nextValues;
}

function resolveAttemptCurrency(row: OrderPaymentRow, currency: string | null | undefined) {
  return currency?.trim().toUpperCase() || "UGX";
}

function resolveStoredOrderAmount(row: OrderPaymentRow) {
  return Math.round(Number(row.total_ugx ?? row.total_price ?? 0));
}

function isPendingOrderLifecycle(row: OrderPaymentRow) {
  return normalizeOrderStatusLabel(row.order_status ?? row.status, row.payment_status) === "Pending Payment";
}

function isOlderThanThreshold(
  value: string | null | undefined,
  thresholdMs: number,
  nowMs: number,
) {
  if (!value) {
    return true;
  }

  const parsedMs = Date.parse(value);
  if (!Number.isFinite(parsedMs)) {
    return true;
  }

  return nowMs - parsedMs >= thresholdMs;
}

function isOlderThanSoftCancelWindow(createdAt: string, nowMs: number) {
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return nowMs - createdAtMs >= PENDING_PAYMENT_RECOVERY_SOFT_CANCEL_MS;
}

function isTrackedPendingPaymentEligibleForRecovery(row: OrderPaymentRow, nowMs: number) {
  return (
    isPendingOrderLifecycle(row)
    && normalizeStoredPaymentStatus(row.payment_status) === "pending"
    && Boolean(row.order_tracking_id)
    && isOlderThanThreshold(
      row.payment_last_verified_at,
      PENDING_PAYMENT_RECOVERY_VERIFY_THROTTLE_MS,
      nowMs,
    )
  );
}

async function listRecentTrackedPendingOrdersForRecovery(now: Date) {
  const createdAfter = new Date(
    now.getTime() - PENDING_PAYMENT_RECOVERY_LOOKBACK_MS,
  ).toISOString();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_PAYMENT_SELECTION)
    .eq("status", "Pending Payment")
    .not("order_tracking_id", "is", null)
    .not("payment_status", "in", "(paid,completed,cancelled,canceled)")
    .gte("created_at", createdAfter)
    .order("created_at", { ascending: true })
    .limit(PENDING_PAYMENT_RECOVERY_SCAN_LIMIT);

  if (error) {
    console.error("pending_payment_recovery_list_failed", {
      error: error.message,
    });
    throw new Error("Unable to list pending payment recoveries.");
  }

  return (data as unknown as OrderPaymentRow[] | null) ?? [];
}

async function cancelExpiredTrackedPendingOrder(row: OrderPaymentRow) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "Cancelled",
      order_status: "cancelled",
      payment_status: "cancelled",
    })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .eq("status", "Pending Payment")
    .not("payment_status", "in", "(paid,completed,cancelled,canceled)")
    .select(ORDER_PAYMENT_SELECTION)
    .maybeSingle();

  if (error) {
    console.error("pending_payment_recovery_cancel_failed", {
      orderId: row.id,
      error: error.message,
    });
    throw new Error("Unable to cancel expired pending payment.");
  }

  if (data) {
    return data as unknown as OrderPaymentRow;
  }

  const latestRow = await getOrderPaymentRow(row.id);
  if (!latestRow) {
    throw new Error("Order not found.");
  }

  return latestRow;
}

function shouldAttemptPaidOrderInventoryDeduction(row: OrderPaymentRow) {
  const deductionStatus = row.inventory_deduction_status?.trim().toLowerCase();

  return (
    deductionStatus !== "completed"
    && deductionStatus !== "partial_conflict"
    && deductionStatus !== "conflict"
    && deductionStatus !== "review_required"
  );
}

function resolveFulfillmentMethod(row: OrderPaymentRow): "delivery" | "pickup" {
  return row.fulfillment_method ?? row.delivery_method ?? "pickup";
}

function resolveDeliveryAddress(row: OrderPaymentRow) {
  const values = [
    row.delivery_address_text,
    row.delivery_address,
    row.address,
  ];

  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function resolveDeliveryFeeUGX(row: OrderPaymentRow) {
  return Math.max(Math.round(Number(row.delivery_fee ?? 0)), 0);
}

function hasOrderReadAccess(
  row: OrderPaymentRow,
  options?: {
    authenticatedUserId?: string | null;
    accessToken?: string | null;
  },
) {
  if (options?.authenticatedUserId && row.customer_id === options.authenticatedUserId) {
    return true;
  }

  return Boolean(options?.accessToken && options.accessToken === row.order_access_token);
}

function assertOrderAccess(row: OrderPaymentRow, accessToken?: string | null) {
  if (!hasOrderReadAccess(row, { accessToken })) {
    throw new OrderAccessDeniedError();
  }
}

function assertOrderReadAccess(
  row: OrderPaymentRow,
  options?: {
    authenticatedUserId?: string | null;
    accessToken?: string | null;
  },
) {
  if (!hasOrderReadAccess(row, options)) {
    throw new OrderAccessDeniedError();
  }
}

function buildAuthorityMessage(input: {
  ok: boolean;
  stickyPaid: boolean;
  justBecamePaid: boolean;
  wasAlreadyPaid: boolean;
  verificationState: PaymentStatus;
  reviewRequired?: boolean;
  inventoryConflict?: boolean;
}) {
  if (!input.ok) {
    return "Payment amount verification failed. Order held for review.";
  }

  if (input.reviewRequired) {
    if (input.inventoryConflict) {
      return "Payment verified and paid transition persisted. Fulfillment review required due to stock conflict.";
    }

    return "Payment verified and paid transition persisted. Fulfillment review is required.";
  }

  if (input.justBecamePaid) {
    return "Payment verified and paid transition persisted.";
  }

  if (input.stickyPaid) {
    return "Payment remains paid after reverification.";
  }

  if (input.wasAlreadyPaid && input.verificationState === "paid") {
    return "Payment was already settled.";
  }

  if (input.verificationState === "pending") {
    return "Payment is still pending.";
  }

  if (input.verificationState === "failed") {
    return "Payment verification shows a failed payment state.";
  }

  if (input.verificationState === "cancelled") {
    return "Payment verification shows a cancelled payment state.";
  }

  return "Payment verification completed.";
}

function buildAuthorityResult(input: {
  ok: boolean;
  row: OrderPaymentRow;
  provider: PaymentProviderName;
  providerStatus: string | null;
  stickyPaid: boolean;
  wasAlreadyPaid: boolean;
  isNowPaid: boolean;
  justBecamePaid: boolean;
  amountExpected: number;
  amountReceived: number | null;
  currency: string;
  paymentReference: string | null;
  updated: boolean;
  snapshotVerified: boolean;
}) : OrderPaymentAuthorityResult {
  const verificationState = normalizeStoredPaymentStatus(input.row.payment_status);

  return {
    ok: input.ok,
    orderId: input.row.id,
    provider: input.provider,
    verificationState,
    providerStatus: input.providerStatus,
    stickyPaid: input.stickyPaid,
    wasAlreadyPaid: input.wasAlreadyPaid,
    isNowPaid: input.isNowPaid,
    justBecamePaid: input.justBecamePaid,
    amountExpected: input.amountExpected,
    amountReceived: input.amountReceived,
    currency: input.currency,
    providerTrackingId: input.row.order_tracking_id,
    merchantReference: input.row.id,
    paymentReference: input.paymentReference ?? input.row.payment_reference,
    updated: input.updated,
    orderSnapshot: buildSnapshot(input.row, {
      verified: input.snapshotVerified,
    }),
    message: buildAuthorityMessage({
      ok: input.ok,
      stickyPaid: input.stickyPaid,
      justBecamePaid: input.justBecamePaid,
      wasAlreadyPaid: input.wasAlreadyPaid,
      verificationState,
      reviewRequired: Boolean(input.row.fulfillment_review_required),
      inventoryConflict: Boolean(input.row.inventory_conflict),
    }),
  };
}

function buildOrderDetailSnapshot(
  row: OrderPaymentRow,
  options?: {
    verified?: boolean;
    hint?: "cancelled" | "pending";
  },
): OrderDetailSnapshot {
  const paymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  const items = (row.order_items ?? []).map((item) => ({
    name: item.name,
    priceUGX: Math.round(Number(item.price_ugx ?? 0)),
    quantity: item.quantity,
    selectedSize: item.selected_size,
    selectedFlavor: item.selected_flavor,
  }));
  const deliveryFeeUGX = resolveDeliveryFeeUGX(row);
  const subtotalUGX = items.reduce((sum, item) => sum + (item.priceUGX * item.quantity), 0);

  return {
    orderId: row.id,
    customerName: row.customer_name,
    orderStatus: normalizeOrderStatusLabel(row.order_status ?? row.status, row.payment_status),
    totalUGX: row.total_ugx,
    subtotalUGX: subtotalUGX > 0 ? subtotalUGX : Math.max(row.total_ugx - deliveryFeeUGX, 0),
    deliveryFeeUGX,
    paymentStatus,
    paymentStatusLabel: formatPaymentStatusLabel(row.payment_status),
    viewState: mapViewState(paymentStatus, options?.hint),
    verified: options?.verified ?? paymentStatus === "paid",
    fulfillmentMethod: resolveFulfillmentMethod(row),
    deliveryAddress: resolveDeliveryAddress(row),
    deliveryDate: row.delivery_date,
    notes: row.notes?.trim() || null,
    createdAt: row.created_at,
    items,
  };
}

async function attemptPaidOrderInventoryDeduction(
  orderId: string,
): Promise<InventoryDeductionAttemptResult | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("attempt_paid_order_inventory_deduction", {
    p_order_id: orderId,
  });

  if (error) {
    console.error("order_inventory_deduction_rpc_failed", {
      orderId,
      error: error.message,
    });
    throw new Error("Unable to complete paid-order inventory deduction.");
  }

  if (Array.isArray(data)) {
    return (data[0] as InventoryDeductionAttemptResult | null) ?? null;
  }

  return (data as InventoryDeductionAttemptResult | null) ?? null;
}

async function markOrderFulfillmentReviewRequired(
  orderId: string,
  reason: string,
): Promise<OrderPaymentRow | null> {
  return updateOrderPaymentRow(orderId, {
    fulfillment_review_required: true,
    fulfillment_review_reason: reason,
    inventory_conflict: reason.includes("conflict"),
    inventory_deduction_status: "review_required",
    inventory_deduction_attempted_at: new Date().toISOString(),
  });
}

async function persistVerifiedPaymentResult(input: {
  row: OrderPaymentRow;
  verified: OrderPaymentVerificationRecord;
  nextPaymentStatus: PaymentStatus;
}): Promise<PersistedOrderPaymentVerification> {
  const nextPaidAt =
    input.nextPaymentStatus === "paid"
      ? input.row.paid_at ?? input.verified.verifiedAt
      : input.row.paid_at;
  const updateValues: Partial<OrderPaymentRow> = {
    payment_provider: input.verified.provider,
    payment_status: input.nextPaymentStatus,
    payment_reference: input.verified.paymentReference ?? input.row.payment_reference,
    paid_at: nextPaidAt,
    order_tracking_id: input.verified.providerReference,
    payment_last_verified_at: input.verified.verifiedAt,
    ...(input.nextPaymentStatus === "paid"
      ? resolvePaidLifecycleUpdates(input.row)
      : {}),
  };
  const wasAlreadyPaid = normalizeStoredPaymentStatus(input.row.payment_status) === "paid";
  const isNowPaid = input.nextPaymentStatus === "paid";

  if (!wasAlreadyPaid) {
    const claimedRow = await updateOrderPaymentRow(input.row.id, updateValues, {
      onlyIfNotAlreadyPaid: true,
    });

    if (claimedRow) {
      return {
        row: claimedRow,
        updated: hasCanonicalPaymentFieldsChanged(input.row, claimedRow),
        justBecamePaid: isNowPaid,
      };
    }

    const latestRow = await getOrderPaymentRow(input.row.id);
    if (!latestRow) {
      throw new Error("Order not found.");
    }

    if (isNowPaid && normalizeStoredPaymentStatus(latestRow.payment_status) !== "paid") {
      console.warn("order_payment_paid_persist_retry", {
        orderId: input.row.id,
        previousPaymentStatus: input.row.payment_status,
        latestPaymentStatus: latestRow.payment_status,
        nextPaymentStatus: input.nextPaymentStatus,
        providerStatus: input.verified.providerStatus,
      });

      const forcedPaidRow = await updateOrderPaymentRow(input.row.id, updateValues);
      if (!forcedPaidRow) {
        throw new Error("Order not found.");
      }

      return {
        row: forcedPaidRow,
        updated: hasCanonicalPaymentFieldsChanged(input.row, forcedPaidRow),
        justBecamePaid: normalizeStoredPaymentStatus(forcedPaidRow.payment_status) === "paid",
      };
    }

    return {
      row: latestRow,
      updated: hasCanonicalPaymentFieldsChanged(input.row, latestRow),
      justBecamePaid: false,
    };
  }

  const updatedRow = await updateOrderPaymentRow(input.row.id, updateValues);
  if (!updatedRow) {
    throw new Error("Order not found.");
  }

  return {
    row: updatedRow,
    updated: hasCanonicalPaymentFieldsChanged(input.row, updatedRow),
    justBecamePaid: false,
  };
}

export async function initiateOrderPaymentForOrder(
  orderId: string,
  options?: {
    requestOrigin?: string | null;
    accessToken?: string | null;
    requireAccessToken?: boolean;
  },
): Promise<InitiatedOrderPayment> {
  let row = await getOrderPaymentRow(orderId);
  if (!row) {
    throw new Error("Order not found.");
  }

  if (options?.requireAccessToken) {
    assertOrderAccess(row, options.accessToken);
  }

  const providerName = resolveConfiguredProviderForInitiation(row);
  const gateway = getPaymentGateway(providerName);
  const storedPaymentStatus = normalizeStoredPaymentStatus(row.payment_status);

  console.info("PAYMENT_INIT_ATTEMPT", {
    orderId,
    merchantReference: row.id,
    amount: row.total_ugx,
    provider: providerName,
    storedPaymentStatus,
    hasExistingTrackingId: Boolean(row.order_tracking_id),
    hasExistingRedirectUrl: Boolean(row.payment_redirect_url),
  });

  if (storedPaymentStatus === "paid") {
    throw new Error("Order has already been paid.");
  }

  if (storedPaymentStatus === "cancelled") {
    throw new Error("Order payment has been cancelled.");
  }

  if (row.payment_provider && row.payment_provider !== providerName) {
    throw new Error("Order is assigned to a different payment provider.");
  }

  if (row.order_tracking_id && row.payment_redirect_url) {
    await upsertPaymentAttempt({
      orderId: row.id,
      provider: providerName,
      providerReference: row.order_tracking_id,
      amount: row.total_ugx,
      currency: "UGX",
      status: storedPaymentStatus,
      redirectUrl: row.payment_redirect_url,
      rawProviderResponse: {
        reusedExistingAttempt: true,
        paymentReference: row.payment_reference,
      },
      createdAt: row.created_at,
      verifiedAt: row.paid_at,
    });

    console.info("order_payment_initiate_reuse", {
      orderId,
      provider: providerName,
      orderTrackingId: row.order_tracking_id,
      paymentStatus: storedPaymentStatus,
    });
    console.info("PAYMENT_INIT_REUSE", {
      orderId,
      merchantReference: row.id,
      amount: row.total_ugx,
      provider: providerName,
      trackingId: row.order_tracking_id,
    });
    return {
      orderId,
      redirectUrl: row.payment_redirect_url,
      paymentStatus: storedPaymentStatus,
    };
  }

  if (row.payment_initiation_attempted_at) {
    if (!isPaymentInitiationLeaseExpired(row.payment_initiation_attempted_at)) {
      throw new Error(PAYMENT_INITIATION_PENDING_VERIFICATION_ERROR);
    }

    const releasedRow = await releaseStaleOrderPaymentInitiation(
      row.id,
      row.payment_initiation_attempted_at,
    );

    if (releasedRow) {
      console.warn("order_payment_initiation_stale_claim_released", {
        orderId,
        attemptedAt: row.payment_initiation_attempted_at,
      });
      row = releasedRow;
    } else {
      const latestRow = await getOrderPaymentRow(orderId);
      if (!latestRow) {
        throw new Error("Order not found.");
      }

      const latestPaymentStatus = normalizeStoredPaymentStatus(latestRow.payment_status);
      if (latestPaymentStatus === "paid") {
        throw new Error("Order has already been paid.");
      }

      if (latestPaymentStatus === "cancelled") {
        throw new Error("Order payment has been cancelled.");
      }

      if (latestRow.order_tracking_id && latestRow.payment_redirect_url) {
        await upsertPaymentAttempt({
          orderId: latestRow.id,
          provider: providerName,
          providerReference: latestRow.order_tracking_id,
          amount: latestRow.total_ugx,
          currency: "UGX",
          status: latestPaymentStatus,
          redirectUrl: latestRow.payment_redirect_url,
          rawProviderResponse: {
            reusedExistingAttemptAfterStaleClaimReleaseMiss: true,
            paymentReference: latestRow.payment_reference,
          },
          createdAt: latestRow.created_at,
          verifiedAt: latestRow.paid_at,
        });

        return {
          orderId,
          redirectUrl: latestRow.payment_redirect_url,
          paymentStatus: latestPaymentStatus,
        };
      }

      if (latestRow.payment_initiation_attempted_at) {
        throw new Error(PAYMENT_INITIATION_PENDING_VERIFICATION_ERROR);
      }

      row = latestRow;
    }
  }

  const claimedRow = await claimOrderPaymentInitiation(orderId);
  if (!claimedRow) {
    const latestRow = await getOrderPaymentRow(orderId);
    if (!latestRow) {
      throw new Error("Order not found.");
    }

    const latestPaymentStatus = normalizeStoredPaymentStatus(latestRow.payment_status);
    if (latestPaymentStatus === "paid") {
      throw new Error("Order has already been paid.");
    }

    if (latestPaymentStatus === "cancelled") {
      throw new Error("Order payment has been cancelled.");
    }

    if (latestRow.order_tracking_id && latestRow.payment_redirect_url) {
      await upsertPaymentAttempt({
        orderId: latestRow.id,
        provider: providerName,
        providerReference: latestRow.order_tracking_id,
        amount: latestRow.total_ugx,
        currency: "UGX",
        status: latestPaymentStatus,
        redirectUrl: latestRow.payment_redirect_url,
        rawProviderResponse: {
          reusedExistingAttemptAfterClaimMiss: true,
          paymentReference: latestRow.payment_reference,
        },
        createdAt: latestRow.created_at,
        verifiedAt: latestRow.paid_at,
      });

      return {
        orderId,
        redirectUrl: latestRow.payment_redirect_url,
        paymentStatus: latestPaymentStatus,
      };
    }

    throw new Error(PAYMENT_INITIATION_PENDING_VERIFICATION_ERROR);
  }

  const providerInitiationStartedAt = performance.now();
  const response = await gateway.initiatePayment({
    orderId: row.id,
    amount: row.total_ugx,
    currency: "UGX",
    description: buildOrderDescription(row.id),
    customerName: row.customer_name,
    orderAccessLinkToken: createOrderAccessLinkToken({
      orderId: row.id,
      accessToken: row.order_access_token,
    }),
    phone: row.customer_phone ?? row.phone,
    email: row.customer_email ?? row.email,
    requestOrigin: options?.requestOrigin,
  });
  const providerInitiationDurationMs = Math.round((performance.now() - providerInitiationStartedAt) * 100) / 100;

  console.info("order_payment_initiate_update", {
    orderId,
    provider: providerName,
    providerReference: response.providerReference,
    durationMs: providerInitiationDurationMs,
  });

  await updateOrderPaymentRow(orderId, {
    payment_provider: providerName,
    payment_status: response.paymentStatus,
    order_tracking_id: response.providerReference,
    payment_redirect_url: response.redirectUrl,
    payment_initiation_failure_code: null,
    payment_initiation_failure_message: null,
    payment_initiation_failed_at: null,
    payment_initiation_attempted_at: claimedRow.payment_initiation_attempted_at,
  });

  await upsertPaymentAttempt({
    orderId: row.id,
    provider: providerName,
    providerReference: response.providerReference,
    amount: row.total_ugx,
    currency: "UGX",
    status: response.paymentStatus,
    redirectUrl: response.redirectUrl,
    rawProviderResponse: response.rawResponse,
    createdAt: row.created_at,
  });

  if (!response.redirectUrl) {
    throw new Error("Payment provider did not return a redirect URL.");
  }

  return {
    orderId,
    redirectUrl: response.redirectUrl,
    paymentStatus: response.paymentStatus,
  };
}

export async function verifyOrderPaymentAuthority(
  orderId: string,
  options: Omit<VerifyOrderPaymentAuthorityOptions, "orderId">,
): Promise<OrderPaymentAuthorityResult> {
  if (options.merchantReference && options.merchantReference !== orderId) {
    console.error("order_payment_reference_mismatch", {
      orderId,
      merchantReference: options.merchantReference,
      source: options.source,
    });
    throw new Error("Merchant reference does not match the order.");
  }

  const row = await getOrderPaymentRow(orderId);
  if (!row) {
    throw new Error("Order not found.");
  }

  const providerName = resolveProviderForVerification(row);
  const gateway = getPaymentGateway(providerName);
  const providerReference = options.orderTrackingId ?? row.order_tracking_id;

  if (row.payment_provider && row.payment_provider !== providerName) {
    throw new Error("Order is assigned to a different payment provider.");
  }

  if (!providerReference) {
    throw new Error("Order does not have a payment tracking ID yet.");
  }

  if (row.order_tracking_id && row.order_tracking_id !== providerReference) {
    console.error("order_payment_tracking_mismatch", {
      orderId,
      expected: row.order_tracking_id,
      received: providerReference,
      source: options.source,
    });
    throw new Error("Tracking ID does not match the stored order.");
  }

  console.info("order_payment_authority_start", {
    orderId,
    provider: providerName,
    orderTrackingId: providerReference,
    source: options.source,
    currentPaymentStatus: row.payment_status,
  });
  console.info("STATUS_CHECK", {
    orderId,
    merchantReference: row.id,
    trackingId: providerReference,
    amount: row.total_ugx,
    provider: providerName,
    source: options.source,
  });

  const providerVerificationStartedAt = performance.now();
  const status = await gateway.verifyPayment({
    orderId,
    providerReference,
    merchantReference: options.merchantReference,
    source: options.source,
  });
  const providerVerificationDurationMs = Math.round((performance.now() - providerVerificationStartedAt) * 100) / 100;
  const expectedAmount = resolveStoredOrderAmount(row);
  const receivedAmount =
    status.amount != null ? Math.round(Number(status.amount)) : null;
  const currency = resolveAttemptCurrency(row, status.currency);
  const storedPaymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  const nextPaymentStatus = resolveVerifiedPaymentStatus(storedPaymentStatus, status.paymentStatus);
  const stickyPaid = storedPaymentStatus === "paid" && status.paymentStatus !== "paid";
  console.info("order_payment_authority_verified", {
    orderId,
    provider: providerName,
    orderTrackingId: status.providerReference,
    source: options.source,
    storedPaymentStatus,
    verifiedPaymentStatus: status.paymentStatus,
    providerStatus: status.providerStatus,
    expectedAmount,
    receivedAmount,
  });
  const verifiedPayment: OrderPaymentVerificationRecord = {
    provider: status.provider,
    providerReference: status.providerReference,
    providerStatus: status.providerStatus,
    paymentReference: status.paymentReference,
    rawResponse: status.rawResponse,
    verifiedAt: status.verifiedAt,
  };

  if (status.paymentStatus === "paid" && receivedAmount !== expectedAmount) {
    logSecurityEvent({
      event: "payment_amount_mismatch",
      severity: "error",
      details: {
        orderId,
        provider: status.provider,
        providerReference: status.providerReference,
        source: options.source,
        expectedAmount,
        receivedAmount,
        currency,
        providerStatus: status.providerStatus,
      },
      report: {
        key: `payment_amount_mismatch:${status.provider}`,
        thresholds: [1, 3, 5],
        windowMs: 60 * 60_000,
      },
    });
    console.error("payment_amount_mismatch", {
      orderId,
      provider: status.provider,
      providerReference: status.providerReference,
      source: options.source,
      expectedAmount,
      receivedAmount,
      currency,
      providerStatus: status.providerStatus,
    });

    await upsertPaymentAttempt({
      orderId: row.id,
      provider: status.provider,
      providerReference: status.providerReference,
      amount: receivedAmount ?? expectedAmount,
      currency,
      status: storedPaymentStatus === "paid" ? storedPaymentStatus : "pending",
      redirectUrl: row.payment_redirect_url,
      rawProviderResponse: {
        verificationRejected: "amount_mismatch",
        expectedAmount,
        receivedAmount,
        providerStatus: status.providerStatus,
        payload: status.rawResponse,
      },
      createdAt: row.created_at,
      verifiedAt: row.paid_at ?? status.verifiedAt,
    });

    await updateOrderPaymentRow(row.id, {
      payment_last_verified_at: status.verifiedAt,
    });

    return buildAuthorityResult({
      ok: false,
      row,
      provider: status.provider,
      providerStatus: status.providerStatus,
      stickyPaid,
      wasAlreadyPaid: storedPaymentStatus === "paid",
      isNowPaid: nextPaymentStatus === "paid",
      justBecamePaid: false,
      amountExpected: expectedAmount,
      amountReceived: receivedAmount,
      currency,
      paymentReference: status.paymentReference,
      updated: false,
      snapshotVerified: false,
    });
  }

  const persisted = await persistVerifiedPaymentResult({
    row,
    verified: verifiedPayment,
    nextPaymentStatus,
  });
  let finalRow = persisted.row;
  let updated = persisted.updated;
  let finalPaymentStatus = normalizeStoredPaymentStatus(finalRow.payment_status);

  await upsertPaymentAttempt({
    orderId: finalRow.id,
    provider: status.provider,
    providerReference: status.providerReference,
    amount: receivedAmount ?? expectedAmount,
    currency,
    status: finalPaymentStatus,
    redirectUrl: finalRow.payment_redirect_url,
    rawProviderResponse: status.rawResponse,
    createdAt: finalRow.created_at,
    verifiedAt: finalRow.paid_at ?? status.verifiedAt,
  });

  if (finalPaymentStatus === "paid" && shouldAttemptPaidOrderInventoryDeduction(finalRow)) {
    try {
      const deductionResult = await attemptPaidOrderInventoryDeduction(finalRow.id);
      console.info("order_payment_inventory_deduction_result", {
        orderId,
        source: options.source,
        justBecamePaid: persisted.justBecamePaid,
        inventoryDeductionStatus: deductionResult?.inventory_deduction_status ?? null,
        reviewRequired: deductionResult?.fulfillment_review_required ?? null,
        inventoryConflict: deductionResult?.inventory_conflict ?? null,
        reservedItemCount: deductionResult?.reserved_item_count ?? null,
        conflictedItemCount: deductionResult?.conflicted_item_count ?? null,
      });

      const refreshedRow = await getOrderPaymentRow(finalRow.id);
      if (refreshedRow) {
        updated = updated || hasInventoryFulfillmentStateChanged(finalRow, refreshedRow);
        finalRow = refreshedRow;
        finalPaymentStatus = normalizeStoredPaymentStatus(finalRow.payment_status);
      }
    } catch (inventoryError) {
      console.error("order_payment_inventory_deduction_failed", {
        orderId,
        source: options.source,
        error: inventoryError instanceof Error ? inventoryError.message : "unknown error",
      });
      await captureOperationalIncident({
        type: "inventory_deduction_failed_after_payment",
        severity: "high",
        source: `payment_authority:${options.source}`,
        message: "Inventory deduction failed after payment settlement.",
        orderId,
        paymentTrackingId: status.providerReference,
        dedupeKey: `inventory_deduction_failed_after_payment:${orderId}`,
        context: {
          provider: providerName,
          source: options.source,
          error: inventoryError instanceof Error ? inventoryError.message : "unknown_error",
        },
      });

      const reviewRow = await markOrderFulfillmentReviewRequired(
        finalRow.id,
        "Inventory deduction failed after payment settlement. Manual review required.",
      );

      if (reviewRow) {
        updated = updated || hasInventoryFulfillmentStateChanged(finalRow, reviewRow);
        finalRow = reviewRow;
        finalPaymentStatus = normalizeStoredPaymentStatus(finalRow.payment_status);
      }
    }
  }

  if (persisted.justBecamePaid) {
    try {
      await triggerAdminPaidOrderPushDispatch(finalRow.id);
    } catch (adminPushError) {
      console.error("admin_paid_order_push_dispatch_failed", {
        orderId,
        source: options.source,
        error: adminPushError instanceof Error ? adminPushError.message : "unknown error",
      });
      await captureOperationalIncident({
        type: "admin_paid_order_push_dispatch_failed",
        severity: "medium",
        source: `payment_authority:${options.source}`,
        message: "Admin paid-order push dispatch trigger failed.",
        orderId,
        paymentTrackingId: status.providerReference,
        dedupeKey: `admin_paid_order_push_dispatch_failed:${orderId}`,
        context: {
          provider: providerName,
          source: options.source,
          error: adminPushError instanceof Error ? adminPushError.message : "unknown_error",
        },
      });
    }
  }

  console.info("order_payment_authority_success", {
    orderId,
    provider: providerName,
    orderTrackingId: status.providerReference,
    source: options.source,
    paymentStatus: finalPaymentStatus,
    providerStatus: status.providerStatus,
    stickyPaid,
    justBecamePaid: persisted.justBecamePaid,
    reviewRequired: finalRow.fulfillment_review_required,
    inventoryConflict: finalRow.inventory_conflict,
    inventoryDeductionStatus: finalRow.inventory_deduction_status,
    durationMs: providerVerificationDurationMs,
  });

  return buildAuthorityResult({
    ok: true,
    row: finalRow,
    provider: status.provider,
    providerStatus: status.providerStatus,
    stickyPaid,
    wasAlreadyPaid: storedPaymentStatus === "paid",
    isNowPaid: finalPaymentStatus === "paid",
    justBecamePaid: persisted.justBecamePaid,
    amountExpected: expectedAmount,
    amountReceived: receivedAmount,
    currency,
    paymentReference: status.paymentReference,
    updated,
    snapshotVerified: true,
  });
}

export async function syncOrderPaymentForOrder(
  input: SyncPaymentInput,
): Promise<OrderPaymentSnapshot> {
  const result = await verifyOrderPaymentAuthority(input.orderId, {
    orderTrackingId: input.orderTrackingId,
    merchantReference: input.merchantReference,
    source: input.source,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.orderSnapshot;
}

export async function getOrderPaymentSnapshot(
  orderId: string,
  options?: {
    refresh?: boolean;
    hint?: "cancelled" | "pending";
    accessToken?: string | null;
    requireAccessToken?: boolean;
  },
): Promise<OrderPaymentSnapshot> {
  const row = await getOrderPaymentRow(orderId);
  if (!row) {
    throw new Error("Order not found.");
  }

  if (options?.requireAccessToken) {
    assertOrderAccess(row, options.accessToken);
  }

  const paymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  const shouldRefresh = Boolean(
    options?.refresh && row.order_tracking_id && paymentStatus === "pending",
  );

  if (shouldRefresh) {
    return unstable_cache(
      async () =>
        syncOrderPaymentForOrder({
          orderId,
          orderTrackingId: row.order_tracking_id,
          source: "status",
        }),
      ["order-payment-status-refresh", orderId],
      { revalidate: PAYMENT_STATUS_REFRESH_REVALIDATE_SECONDS },
    )();
  }

  return buildSnapshot(row, {
    hint: options?.hint,
  });
}

export async function getOrderDetailSnapshot(
  orderId: string,
  options?: {
    refresh?: boolean;
    hint?: "cancelled" | "pending";
    accessToken?: string | null;
    authenticatedUserId?: string | null;
    requireAuthorization?: boolean;
  },
): Promise<OrderDetailSnapshot> {
  const row = await getOrderPaymentRow(orderId);
  if (!row) {
    throw new Error("Order not found.");
  }

  if (options?.requireAuthorization) {
    assertOrderReadAccess(row, {
      authenticatedUserId: options.authenticatedUserId,
      accessToken: options.accessToken,
    });
  }

  const paymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  const shouldRefresh = Boolean(
    options?.refresh && row.order_tracking_id && paymentStatus === "pending",
  );

  if (shouldRefresh) {
    await unstable_cache(
      async () =>
        syncOrderPaymentForOrder({
          orderId,
          orderTrackingId: row.order_tracking_id,
          source: "status",
        }),
      ["order-detail-status-refresh", orderId],
      { revalidate: PAYMENT_STATUS_REFRESH_REVALIDATE_SECONDS },
    )();

    const refreshedRow = await getOrderPaymentRow(orderId);
    if (!refreshedRow) {
      throw new Error("Order not found.");
    }

    if (options?.requireAuthorization) {
      assertOrderReadAccess(refreshedRow, {
        authenticatedUserId: options.authenticatedUserId,
        accessToken: options.accessToken,
      });
    }

    return buildOrderDetailSnapshot(refreshedRow, {
      verified: true,
      hint: options?.hint,
    });
  }

  return buildOrderDetailSnapshot(row, {
    hint: options?.hint,
  });
}

export async function reconcileDuePendingTrackedPayments(
  trigger: string,
  options?: {
    now?: Date;
    listOrders?: (now: Date) => Promise<OrderPaymentRow[]>;
    verifyOrder?: (row: OrderPaymentRow) => Promise<OrderPaymentAuthorityResult>;
    getLatestOrder?: (orderId: string) => Promise<OrderPaymentRow | null>;
    cancelOrder?: (row: OrderPaymentRow) => Promise<OrderPaymentRow>;
  },
): Promise<PendingPaymentRecoveryStats> {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const listOrders = options?.listOrders ?? listRecentTrackedPendingOrdersForRecovery;
  const verifyOrder =
    options?.verifyOrder
    ?? ((row: OrderPaymentRow) =>
      verifyOrderPaymentAuthority(row.id, {
        orderTrackingId: row.order_tracking_id,
        source: "recovery",
      }));
  const getLatestOrder = options?.getLatestOrder ?? getOrderPaymentRow;
  const cancelOrder = options?.cancelOrder ?? cancelExpiredTrackedPendingOrder;
  const scannedOrders = await listOrders(now);
  const stats: PendingPaymentRecoveryStats = {
    trigger,
    scanned: scannedOrders.length,
    verified: 0,
    cancelled: 0,
    skipped: 0,
    errors: 0,
  };

  const eligibleOrders = scannedOrders.filter((row) =>
    isTrackedPendingPaymentEligibleForRecovery(row, nowMs),
  );
  stats.skipped = scannedOrders.length - eligibleOrders.length;

  for (const order of eligibleOrders.slice(0, PENDING_PAYMENT_RECOVERY_PROCESS_LIMIT)) {
    try {
      await verifyOrder(order);
      stats.verified += 1;

      const latestRow = await getLatestOrder(order.id);
      if (
        latestRow
        && isTrackedPendingPaymentEligibleForRecovery(latestRow, nowMs)
        && isOlderThanSoftCancelWindow(latestRow.created_at, nowMs)
      ) {
        const cancelledRow = await cancelOrder(latestRow);
        if (normalizeStoredPaymentStatus(cancelledRow.payment_status) === "cancelled") {
          stats.cancelled += 1;
          await captureOperationalIncident({
            type: "pending_payment_soft_cancelled",
            severity: "medium",
            source: `pending_payment_recovery:${trigger}`,
            message: "Tracked pending payment was soft-cancelled after exceeding the recovery window.",
            orderId: cancelledRow.id,
            paymentTrackingId: cancelledRow.order_tracking_id,
            dedupeKey: `pending_payment_soft_cancelled:${cancelledRow.id}`,
            context: {
              trigger,
              createdAt: cancelledRow.created_at,
              paymentStatus: cancelledRow.payment_status,
            },
          });
        }
      }
    } catch (error) {
      stats.errors += 1;
      console.error("pending_payment_recovery_process_failed", {
        trigger,
        orderId: order.id,
        error: error instanceof Error ? error.message : "unknown error",
      });
      await captureOperationalIncident({
        type: "pending_payment_recovery_process_failed",
        severity: "high",
        source: `pending_payment_recovery:${trigger}`,
        message: "Pending payment recovery processing failed for an order.",
        orderId: order.id,
        paymentTrackingId: order.order_tracking_id,
        dedupeKey: `pending_payment_recovery_process_failed:${order.id}`,
        context: {
          trigger,
          error: error instanceof Error ? error.message : "unknown_error",
        },
      });
    }
  }

  return stats;
}

export function scheduleDuePendingTrackedPaymentRecovery(trigger: string) {
  const nowMs = Date.now();
  if (pendingPaymentRecoveryRunPromise) {
    return pendingPaymentRecoveryRunPromise;
  }

  if (nowMs - pendingPaymentRecoveryLastRunAt < PENDING_PAYMENT_RECOVERY_MIN_RUN_INTERVAL_MS) {
    return null;
  }

  const runPromise = reconcileDuePendingTrackedPayments(trigger)
    .then((stats) => {
      console.info("pending_payment_recovery_completed", stats);
      pendingPaymentRecoveryLastRunAt = Date.now();
      return stats;
    })
    .catch((error) => {
      pendingPaymentRecoveryLastRunAt = Date.now();
      console.error("pending_payment_recovery_failed", {
        trigger,
        error: error instanceof Error ? error.message : "unknown error",
      });
      void captureOperationalIncident({
        type: "pending_payment_recovery_due_scan_failed",
        severity: "medium",
        source: `pending_payment_recovery:${trigger}`,
        message: "Pending payment recovery due-scan failed.",
        dedupeKey: `pending_payment_recovery_due_scan_failed:${trigger}`,
        context: {
          trigger,
          error: error instanceof Error ? error.message : "unknown_error",
        },
      });
      return null;
    })
    .finally(() => {
      pendingPaymentRecoveryRunPromise = null;
    });

  pendingPaymentRecoveryRunPromise = runPromise;
  return runPromise;
}

export const initiatePesapalPaymentForOrder = initiateOrderPaymentForOrder;
export const syncPesapalPaymentForOrder = syncOrderPaymentForOrder;

export async function cancelRejectedOrderPaymentInitiation(input: {
  orderId: string;
  provider: PaymentProviderName;
  reasonCode?: string | null;
  reasonMessage: string;
}): Promise<OrderPaymentSnapshot | null> {
  const row = await getOrderPaymentRow(input.orderId);
  if (!row) {
    throw new Error("Order not found.");
  }

  const storedPaymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  if (
    (row.payment_provider?.trim().toLowerCase() ?? input.provider) !== input.provider
    || storedPaymentStatus !== "pending"
    || !isPendingOrderLifecycle(row)
    || row.order_tracking_id
    || row.payment_redirect_url
  ) {
    console.warn("order_payment_initiation_rejection_cancel_guard_blocked", {
      orderId: input.orderId,
      provider: input.provider,
      storedPaymentStatus,
      paymentProvider: row.payment_provider,
      status: row.status,
      orderStatus: row.order_status,
      hasTrackingId: Boolean(row.order_tracking_id),
      hasRedirectUrl: Boolean(row.payment_redirect_url),
    });
    return null;
  }

  const supabase = getSupabaseServerClient();
  const rejectedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "Cancelled",
      order_status: "cancelled",
      payment_status: "cancelled",
      payment_provider: input.provider,
      payment_initiation_failure_code: input.reasonCode?.trim() || null,
      payment_initiation_failure_message: input.reasonMessage.trim(),
      payment_initiation_failed_at: rejectedAt,
    })
    .eq("id", input.orderId)
    .is("order_tracking_id", null)
    .is("payment_redirect_url", null)
    .not("payment_status", "in", "(paid,completed,cancelled,canceled)")
    .select(ORDER_PAYMENT_SELECTION)
    .maybeSingle();

  if (error) {
    console.error("order_payment_initiation_rejection_cancel_failed", {
      orderId: input.orderId,
      provider: input.provider,
      reasonCode: input.reasonCode ?? null,
      error: error.message,
    });
    throw new Error("Unable to cancel rejected payment initiation.");
  }

  const updatedRow = (data as OrderPaymentRow | null) ?? await getOrderPaymentRow(input.orderId);
  if (!updatedRow) {
    throw new Error("Order not found.");
  }

  if (normalizeStoredPaymentStatus(updatedRow.payment_status) !== "cancelled") {
    console.warn("order_payment_initiation_rejection_cancel_noop", {
      orderId: input.orderId,
      provider: input.provider,
      status: updatedRow.status,
      orderStatus: updatedRow.order_status,
      paymentStatus: updatedRow.payment_status,
      paymentProvider: updatedRow.payment_provider,
      hasTrackingId: Boolean(updatedRow.order_tracking_id),
      hasRedirectUrl: Boolean(updatedRow.payment_redirect_url),
    });
    return null;
  }

  return buildSnapshot(updatedRow, {
    hint: "cancelled",
  });
}

export async function getOrderAccessToken(orderId: string): Promise<string | null> {
  const row = await getOrderPaymentRow(orderId);
  return row?.order_access_token ?? null;
}

export function isOrderAccessDeniedError(error: unknown) {
  return error instanceof OrderAccessDeniedError;
}
