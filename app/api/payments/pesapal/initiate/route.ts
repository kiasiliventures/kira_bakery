import { NextResponse } from "next/server";
import {
  initiateOrderPaymentForOrder,
  isOrderAccessDeniedError,
} from "@/lib/payments/order-payments";
import { enforceRateLimit } from "@/lib/rate-limit";

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request: Request) {
  const rateLimit = await enforceRateLimit(request, "payment-initiate", 6, 60_000);
  if (!rateLimit.allowed) {
    return tooManyRequests(rateLimit.retryAfterSeconds);
  }

  const body = (await request.json().catch(() => null)) as
    | { orderId?: string; accessToken?: string }
    | null;
  const orderId = body?.orderId?.trim();
  const accessToken = body?.accessToken?.trim();

  if (!orderId) {
    return NextResponse.json({ message: "Missing orderId." }, { status: 400 });
  }
  if (!accessToken) {
    return NextResponse.json({ message: "Missing accessToken." }, { status: 400 });
  }

  try {
    const payment = await initiateOrderPaymentForOrder(orderId, {
      requestOrigin: new URL(request.url).origin,
      accessToken,
      requireAccessToken: true,
    });
    return NextResponse.json({
      ok: true,
      id: payment.orderId,
      redirectUrl: payment.redirectUrl,
      paymentStatus: payment.paymentStatus,
    });
  } catch (error) {
    if (isOrderAccessDeniedError(error)) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to initiate payment." },
      { status: 500 },
    );
  }
}
