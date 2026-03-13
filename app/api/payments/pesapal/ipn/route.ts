import { NextResponse } from "next/server";
import { syncPesapalPaymentForOrder } from "@/lib/payments/order-payments";

type PesapalNotificationPayload = {
  OrderNotificationType?: string | null;
  OrderTrackingId?: string | null;
  OrderMerchantReference?: string | null;
};

function buildAck(payload: PesapalNotificationPayload) {
  const params = new URLSearchParams();
  if (payload.OrderNotificationType) {
    params.set("OrderNotificationType", payload.OrderNotificationType);
  }
  if (payload.OrderTrackingId) {
    params.set("OrderTrackingId", payload.OrderTrackingId);
  }
  if (payload.OrderMerchantReference) {
    params.set("OrderMerchantReference", payload.OrderMerchantReference);
  }
  return params.toString();
}

async function parseNotificationPayload(request: Request): Promise<PesapalNotificationPayload> {
  const url = new URL(request.url);
  const contentType = request.headers.get("content-type") ?? "";

  if (request.method === "GET") {
    return {
      OrderNotificationType: url.searchParams.get("OrderNotificationType"),
      OrderTrackingId: url.searchParams.get("OrderTrackingId"),
      OrderMerchantReference: url.searchParams.get("OrderMerchantReference"),
    };
  }

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as PesapalNotificationPayload | null;
    return body ?? {};
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return {
      OrderNotificationType: String(form.get("OrderNotificationType") ?? ""),
      OrderTrackingId: String(form.get("OrderTrackingId") ?? ""),
      OrderMerchantReference: String(form.get("OrderMerchantReference") ?? ""),
    };
  }

  return {
    OrderNotificationType: url.searchParams.get("OrderNotificationType"),
    OrderTrackingId: url.searchParams.get("OrderTrackingId"),
    OrderMerchantReference: url.searchParams.get("OrderMerchantReference"),
  };
}

async function handleNotification(request: Request) {
  const payload = await parseNotificationPayload(request);
  const orderId = payload.OrderMerchantReference?.trim();
  const orderTrackingId = payload.OrderTrackingId?.trim();

  console.info("pesapal_ipn_received", {
    orderId: orderId ?? null,
    orderTrackingId: orderTrackingId ?? null,
    notificationType: payload.OrderNotificationType ?? null,
  });

  if (!orderId || !orderTrackingId) {
    return NextResponse.json({ message: "Missing notification identifiers." }, { status: 400 });
  }

  try {
    await syncPesapalPaymentForOrder({
      orderId,
      orderTrackingId,
      merchantReference: payload.OrderMerchantReference,
      source: "ipn",
    });
  } catch (error) {
    console.error("pesapal_ipn_sync_failed", {
      orderId,
      orderTrackingId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ message: "Unable to verify payment." }, { status: 500 });
  }

  return new NextResponse(buildAck(payload), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function GET(request: Request) {
  return handleNotification(request);
}

export async function POST(request: Request) {
  return handleNotification(request);
}
