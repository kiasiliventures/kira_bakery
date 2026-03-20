import { NextResponse } from "next/server";
import { getOrderAccessCookie } from "@/lib/payments/order-access-cookie";
import { logSecurityEvent } from "@/lib/observability/security-events";
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
    logSecurityEvent({
      event: "payment_initiate_rate_limited",
      severity: "warning",
      request,
      details: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      report: {
        thresholds: [3, 5, 10],
      },
    });
    return tooManyRequests(rateLimit.retryAfterSeconds);
  }

  const body = (await request.json().catch(() => null)) as
    | { orderId?: string }
    | null;
  const orderId = body?.orderId?.trim();

  if (!orderId) {
    return NextResponse.json({ message: "Missing orderId." }, { status: 400 });
  }
  const accessToken = await getOrderAccessCookie(orderId);
  if (!accessToken) {
    logSecurityEvent({
      event: "payment_initiate_missing_access_session",
      severity: "warning",
      request,
      details: {
        orderId,
      },
      report: {
        thresholds: [3, 5, 10],
      },
    });
    return NextResponse.json({ message: "Missing order access session." }, { status: 403 });
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
      logSecurityEvent({
        event: "payment_initiate_access_denied",
        severity: "warning",
        request,
        details: {
          orderId,
        },
        report: {
          thresholds: [3, 5, 10],
        },
      });
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to initiate payment." },
      { status: 500 },
    );
  }
}
