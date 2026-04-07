import { NextResponse } from "next/server";
import { runAfterResponse } from "@/lib/http/after-response";
import { captureOperationalIncident } from "@/lib/ops/incidents";
import { logSecurityEvent } from "@/lib/observability/security-events";
import { scheduleDueOrderReadyPushProcessing } from "@/lib/push/order-ready";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  scheduleDuePendingTrackedPaymentRecovery,
  syncPesapalPaymentForOrder,
} from "@/lib/payments/order-payments";

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const orderId =
    requestUrl.searchParams.get("orderId")?.trim()
    || requestUrl.searchParams.get("OrderMerchantReference")?.trim();
  const orderTrackingId = requestUrl.searchParams.get("OrderTrackingId")?.trim();
  const cancelled = requestUrl.searchParams.get("cancelled") === "1";
  const orderAccessLinkToken = requestUrl.searchParams.get("access")?.trim();
  const rateLimit = await enforceRateLimit(request, "payment-callback", 90, 60_000, {
    bucketSuffix: [
      "provider_callback",
      orderTrackingId || "unknown_tracking",
      orderId || "unknown_order",
      cancelled ? "cancelled" : "active",
    ].join(":"),
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      event: "payment_callback_rate_limited",
      severity: "warning",
      request,
      details: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      report: {
        thresholds: [10, 25, 50],
      },
    });
    return tooManyRequests(rateLimit.retryAfterSeconds);
  }

  console.info("pesapal_callback_received", {
    orderId: orderId ?? null,
    orderTrackingId: orderTrackingId ?? null,
    cancelled,
  });

  runAfterResponse(async () => {
    await scheduleDuePendingTrackedPaymentRecovery("pesapal_callback");
    await scheduleDueOrderReadyPushProcessing("pesapal_callback");
  });

  if (orderId && orderTrackingId && !cancelled) {
    try {
      await syncPesapalPaymentForOrder({
        orderId,
        orderTrackingId,
        merchantReference: requestUrl.searchParams.get("OrderMerchantReference"),
        source: "callback",
      });
    } catch (error) {
      await captureOperationalIncident({
        type: "payment_callback_sync_failed",
        severity: "high",
        source: "pesapal_callback",
        message: "Pesapal callback payment sync failed.",
        orderId,
        paymentTrackingId: orderTrackingId,
        dedupeKey: `payment_callback_sync_failed:${orderId}:${orderTrackingId}`,
        context: {
          error: error instanceof Error ? error.message : "unknown_error",
        },
      });
      logSecurityEvent({
        event: "payment_callback_sync_failed",
        severity: "error",
        request,
        details: {
          orderId,
          orderTrackingId,
          error: error instanceof Error ? error.message : "unknown error",
        },
      });
      console.error("pesapal_callback_sync_failed", {
        orderId,
        orderTrackingId,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  } else if (!cancelled) {
    logSecurityEvent({
      event: "payment_callback_missing_identifiers",
      severity: "warning",
      request,
      details: {
        orderId: orderId ?? null,
        orderTrackingId: orderTrackingId ?? null,
      },
      report: {
        thresholds: [3, 10, 25],
      },
    });
    console.warn("pesapal_callback_missing_identifiers", {
      orderId: orderId ?? null,
      orderTrackingId: orderTrackingId ?? null,
    });
  }

  const resultUrl = new URL("/payment/result", request.url);
  if (orderId) {
    resultUrl.searchParams.set("orderId", orderId);
  }
  if (orderAccessLinkToken) {
    resultUrl.searchParams.set("access", orderAccessLinkToken);
  }
  if (cancelled) {
    resultUrl.searchParams.set("hint", "cancelled");
  }

  return NextResponse.redirect(resultUrl);
}
