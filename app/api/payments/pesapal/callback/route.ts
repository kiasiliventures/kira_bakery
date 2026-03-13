import { NextResponse } from "next/server";
import { syncPesapalPaymentForOrder } from "@/lib/payments/order-payments";

function buildResultUrl(request: Request, searchParams: URLSearchParams) {
  const resultUrl = new URL("/payment/result", request.url);
  for (const [key, value] of searchParams.entries()) {
    resultUrl.searchParams.set(key, value);
  }
  return resultUrl;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const orderId =
    requestUrl.searchParams.get("orderId")?.trim()
    || requestUrl.searchParams.get("OrderMerchantReference")?.trim();
  const orderTrackingId = requestUrl.searchParams.get("OrderTrackingId")?.trim();
  const cancelled = requestUrl.searchParams.get("cancelled") === "1";

  console.info("pesapal_callback_received", {
    orderId: orderId ?? null,
    orderTrackingId: orderTrackingId ?? null,
    cancelled,
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
      console.error("pesapal_callback_sync_failed", {
        orderId,
        orderTrackingId,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  const resultUrl = buildResultUrl(request, requestUrl.searchParams);
  if (orderId) {
    resultUrl.searchParams.set("orderId", orderId);
  }
  if (orderTrackingId) {
    resultUrl.searchParams.set("orderTrackingId", orderTrackingId);
  }
  if (cancelled) {
    resultUrl.searchParams.set("hint", "cancelled");
  }

  return NextResponse.redirect(resultUrl);
}
