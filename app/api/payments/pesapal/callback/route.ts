import { NextResponse } from "next/server";
import { setOrderAccessCookie } from "@/lib/payments/order-access-cookie";
import {
  syncPesapalPaymentForOrder,
} from "@/lib/payments/order-payments";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const orderId =
    requestUrl.searchParams.get("orderId")?.trim()
    || requestUrl.searchParams.get("OrderMerchantReference")?.trim();
  const orderTrackingId = requestUrl.searchParams.get("OrderTrackingId")?.trim();
  const accessToken = requestUrl.searchParams.get("accessToken")?.trim();
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

  const resultUrl = new URL("/payment/result", request.url);
  if (orderId) {
    resultUrl.searchParams.set("orderId", orderId);
  }
  if (cancelled) {
    resultUrl.searchParams.set("hint", "cancelled");
  }

  const response = NextResponse.redirect(resultUrl);
  if (orderId && accessToken) {
    setOrderAccessCookie(response, orderId, accessToken);
  }
  return response;
}
