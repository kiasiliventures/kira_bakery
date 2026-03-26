import "server-only";

import { unstable_cache } from "next/cache";
import { logSecurityEvent } from "@/lib/observability/security-events";
import { normalizeOrderStatusLabel } from "@/lib/orders/status";
import { getPaymentProvider, parsePaymentProviderName, type PaymentProviderName } from "@/lib/payments/config";
import {
  getPaymentGateway,
  type PaymentStatus,
  type PaymentSyncSource,
} from "@/lib/payments/gateway";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type OrderPaymentRow = {
  id: string;
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
  paid_at: string | null;
  order_tracking_id: string | null;
  created_at: string;
  order_items?: OrderPaymentItemRow[] | null;
};

type OrderPaymentItemRow = {
  name: string;
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
const ORDER_PAYMENT_SELECTION = [
  "id",
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
  "paid_at",
  "order_tracking_id",
  "created_at",
  "order_items(name,quantity,selected_size,selected_flavor)",
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

  if (normalized === "cancelled" || normalized === "canceled" || normalized === "invalid") {
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

function hasCanonicalPaymentFieldsChanged(previous: OrderPaymentRow, next: OrderPaymentRow) {
  return (
    previous.payment_status !== next.payment_status
    || previous.payment_provider !== next.payment_provider
    || previous.payment_reference !== next.payment_reference
    || previous.paid_at !== next.paid_at
    || previous.order_tracking_id !== next.order_tracking_id
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

function resolveAttemptCurrency(row: OrderPaymentRow, currency: string | null | undefined) {
  return currency?.trim().toUpperCase() || "UGX";
}

function resolveStoredOrderAmount(row: OrderPaymentRow) {
  return Math.round(Number(row.total_ugx ?? row.total_price ?? 0));
}

function assertOrderAccess(row: OrderPaymentRow, accessToken?: string | null) {
  if (!accessToken || accessToken !== row.order_access_token) {
    throw new OrderAccessDeniedError();
  }
}

function buildAuthorityMessage(input: {
  ok: boolean;
  stickyPaid: boolean;
  justBecamePaid: boolean;
  wasAlreadyPaid: boolean;
  verificationState: PaymentStatus;
}) {
  if (!input.ok) {
    return "Payment amount verification failed. Order held for review.";
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
    }),
  };
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
  const row = await getOrderPaymentRow(orderId);
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

  const providerInitiationStartedAt = performance.now();
  const response = await gateway.initiatePayment({
    orderId: row.id,
    amount: row.total_ugx,
    currency: "UGX",
    description: buildOrderDescription(row.id),
    customerName: row.customer_name,
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
  const receivedAmount = typeof status.amount === "number" ? Math.round(status.amount) : null;
  const currency = resolveAttemptCurrency(row, status.currency);
  const storedPaymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  const nextPaymentStatus = resolveVerifiedPaymentStatus(storedPaymentStatus, status.paymentStatus);
  const stickyPaid = storedPaymentStatus === "paid" && status.paymentStatus !== "paid";
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
  const finalPaymentStatus = normalizeStoredPaymentStatus(persisted.row.payment_status);

  await upsertPaymentAttempt({
    orderId: persisted.row.id,
    provider: status.provider,
    providerReference: status.providerReference,
    amount: receivedAmount ?? expectedAmount,
    currency,
    status: finalPaymentStatus,
    redirectUrl: persisted.row.payment_redirect_url,
    rawProviderResponse: status.rawResponse,
    createdAt: persisted.row.created_at,
    verifiedAt: persisted.row.paid_at ?? status.verifiedAt,
  });

  console.info("order_payment_authority_success", {
    orderId,
    provider: providerName,
    orderTrackingId: status.providerReference,
    source: options.source,
    paymentStatus: finalPaymentStatus,
    providerStatus: status.providerStatus,
    stickyPaid,
    justBecamePaid: persisted.justBecamePaid,
    durationMs: providerVerificationDurationMs,
  });

  return buildAuthorityResult({
    ok: true,
    row: persisted.row,
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
    updated: persisted.updated,
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

export const initiatePesapalPaymentForOrder = initiateOrderPaymentForOrder;
export const syncPesapalPaymentForOrder = syncOrderPaymentForOrder;

export async function getOrderAccessToken(orderId: string): Promise<string | null> {
  const row = await getOrderPaymentRow(orderId);
  return row?.order_access_token ?? null;
}

export function isOrderAccessDeniedError(error: unknown) {
  return error instanceof OrderAccessDeniedError;
}
