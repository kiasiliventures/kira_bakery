import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getPesapalTransactionStatus,
  normalizePesapalPaymentState,
  submitPesapalOrderRequest,
  type NormalizedPesapalPaymentState,
} from "@/lib/payments/pesapal";

type OrderPaymentRow = {
  id: string;
  total_ugx: number;
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
  order_items?: OrderPaymentItemRow[] | null;
};

type OrderPaymentItemRow = {
  name: string;
  quantity: number;
  selected_size: string | null;
  selected_flavor: string | null;
};

export type PaymentViewState = "success" | "failed" | "cancelled" | "pending";

export type OrderPaymentSnapshot = {
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  paymentProvider: string | null;
  paymentReference: string | null;
  orderTrackingId: string | null;
  redirectUrl: string | null;
  paidAt: string | null;
  viewState: PaymentViewState;
  verified: boolean;
  providerStatus: string | null;
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
  orderTrackingId: string;
  paymentStatus: string;
};

type SyncPaymentInput = {
  orderId: string;
  orderTrackingId?: string | null;
  merchantReference?: string | null;
  source: "checkout" | "initiate" | "ipn" | "callback" | "status";
};

function normalizeStoredPaymentStatus(paymentStatus: string | null | undefined): string {
  return paymentStatus?.trim().toLowerCase() || "unpaid";
}

function mapViewState(
  paymentStatus: string,
  hint?: "cancelled" | "pending",
): PaymentViewState {
  if (paymentStatus === "paid") {
    return "success";
  }
  if (paymentStatus === "failed") {
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
    .select(
      [
        "id",
        "total_ugx",
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
        "order_items(name,quantity,selected_size,selected_flavor)",
      ].join(","),
    )
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
    providerStatus?: string | null;
    verified?: boolean;
    hint?: "cancelled" | "pending";
  },
): OrderPaymentSnapshot {
  const paymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  return {
    orderId: row.id,
    orderStatus: row.status,
    paymentStatus,
    paymentProvider: row.payment_provider,
    paymentReference: row.payment_reference,
    orderTrackingId: row.order_tracking_id,
    redirectUrl: row.payment_redirect_url,
    paidAt: row.paid_at,
    viewState: mapViewState(paymentStatus, options?.hint),
    verified: options?.verified ?? paymentStatus === "paid",
    providerStatus: options?.providerStatus ?? null,
    items: (row.order_items ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      selectedSize: item.selected_size,
      selectedFlavor: item.selected_flavor,
    })),
  };
}

async function updateOrderPaymentRow(orderId: string, values: Partial<OrderPaymentRow>) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("orders").update(values).eq("id", orderId);

  if (error) {
    console.error("order_payment_update_failed", { orderId, error: error.message });
    throw new Error("Unable to update order payment details.");
  }
}

function buildOrderDescription(orderId: string) {
  return `Kira Bakery order ${orderId}`;
}

export async function initiatePesapalPaymentForOrder(orderId: string): Promise<InitiatedOrderPayment> {
  const row = await getOrderPaymentRow(orderId);
  if (!row) {
    throw new Error("Order not found.");
  }

  const storedPaymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  console.info("PAYMENT_INIT_ATTEMPT", {
    orderId,
    merchantReference: row.id,
    amount: row.total_ugx,
    storedPaymentStatus,
    hasExistingTrackingId: Boolean(row.order_tracking_id),
    hasExistingRedirectUrl: Boolean(row.payment_redirect_url),
  });

  if (storedPaymentStatus === "paid") {
    throw new Error("Order has already been paid.");
  }

  if (row.order_tracking_id && row.payment_redirect_url) {
    console.info("order_payment_initiate_reuse", {
      orderId,
      orderTrackingId: row.order_tracking_id,
      paymentStatus: storedPaymentStatus,
    });
    console.info("PAYMENT_INIT_REUSE", {
      orderId,
      merchantReference: row.id,
      amount: row.total_ugx,
      trackingId: row.order_tracking_id,
    });
    return {
      orderId,
      redirectUrl: row.payment_redirect_url,
      orderTrackingId: row.order_tracking_id,
      paymentStatus: storedPaymentStatus,
    };
  }

  const response = await submitPesapalOrderRequest({
    orderId: row.id,
    amountUGX: row.total_ugx,
    description: buildOrderDescription(row.id),
    customerName: row.customer_name,
    phone: row.customer_phone ?? row.phone,
    email: row.customer_email ?? row.email,
  });

  console.info("order_payment_initiate_update", {
    orderId,
    orderTrackingId: response.order_tracking_id,
  });

  await updateOrderPaymentRow(orderId, {
    payment_provider: "pesapal",
    payment_status: "pending",
    order_tracking_id: response.order_tracking_id,
    payment_redirect_url: response.redirect_url,
  });

  return {
    orderId,
    redirectUrl: response.redirect_url,
    orderTrackingId: response.order_tracking_id,
    paymentStatus: "pending",
  };
}

function resolveVerifiedPaymentStatus(
  currentStatus: string,
  verifiedStatus: NormalizedPesapalPaymentState,
): string {
  if (currentStatus === "paid" && verifiedStatus !== "paid") {
    return currentStatus;
  }

  if (verifiedStatus === "paid") {
    return "paid";
  }

  return verifiedStatus;
}

export async function syncPesapalPaymentForOrder(
  input: SyncPaymentInput,
): Promise<OrderPaymentSnapshot> {
  if (input.merchantReference && input.merchantReference !== input.orderId) {
    console.error("order_payment_reference_mismatch", {
      orderId: input.orderId,
      merchantReference: input.merchantReference,
      source: input.source,
    });
    throw new Error("Merchant reference does not match the order.");
  }

  const row = await getOrderPaymentRow(input.orderId);
  if (!row) {
    throw new Error("Order not found.");
  }

  if (row.payment_provider && row.payment_provider !== "pesapal") {
    throw new Error("Order is assigned to a different payment provider.");
  }

  const trackingId = input.orderTrackingId ?? row.order_tracking_id;
  if (!trackingId) {
    return buildSnapshot(row, {
      verified: false,
    });
  }

  console.info("STATUS_CHECK", {
    orderId: input.orderId,
    merchantReference: row.id,
    trackingId,
    amount: row.total_ugx,
    source: input.source,
  });

  if (row.order_tracking_id && row.order_tracking_id !== trackingId) {
    console.error("order_payment_tracking_mismatch", {
      orderId: input.orderId,
      expected: row.order_tracking_id,
      received: trackingId,
      source: input.source,
    });
    throw new Error("Tracking ID does not match the stored order.");
  }

  console.info("order_payment_sync_start", {
    orderId: input.orderId,
    orderTrackingId: trackingId,
    source: input.source,
  });

  const status = await getPesapalTransactionStatus(trackingId);
  const verifiedStatus = normalizePesapalPaymentState(status.payment_status_description);
  const storedPaymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  const nextPaymentStatus = resolveVerifiedPaymentStatus(storedPaymentStatus, verifiedStatus);
  const nextPaidAt = nextPaymentStatus === "paid" ? row.paid_at ?? new Date().toISOString() : row.paid_at;

  await updateOrderPaymentRow(input.orderId, {
    payment_provider: "pesapal",
    payment_status: nextPaymentStatus,
    payment_reference: status.confirmation_code ?? row.payment_reference,
    paid_at: nextPaidAt,
    order_tracking_id: trackingId,
  });

  const nextRow: OrderPaymentRow = {
    ...row,
    payment_provider: "pesapal",
    payment_status: nextPaymentStatus,
    payment_reference: status.confirmation_code ?? row.payment_reference,
    paid_at: nextPaidAt,
    order_tracking_id: trackingId,
  };

  console.info("order_payment_sync_success", {
    orderId: input.orderId,
    orderTrackingId: trackingId,
    source: input.source,
    paymentStatus: nextPaymentStatus,
    providerStatus: status.payment_status_description ?? null,
  });

  return buildSnapshot(nextRow, {
    providerStatus: status.payment_status_description ?? null,
    verified: true,
  });
}

export async function getOrderPaymentSnapshot(
  orderId: string,
  options?: {
    refresh?: boolean;
    hint?: "cancelled" | "pending";
  },
): Promise<OrderPaymentSnapshot> {
  const row = await getOrderPaymentRow(orderId);
  if (!row) {
    throw new Error("Order not found.");
  }

  const paymentStatus = normalizeStoredPaymentStatus(row.payment_status);
  const shouldRefresh = Boolean(options?.refresh && row.order_tracking_id && paymentStatus !== "paid");

  if (shouldRefresh) {
    return syncPesapalPaymentForOrder({
      orderId,
      orderTrackingId: row.order_tracking_id,
      source: "status",
    });
  }

  return buildSnapshot(row, {
    hint: options?.hint,
  });
}
