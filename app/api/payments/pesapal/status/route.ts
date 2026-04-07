import { NextResponse } from "next/server";
import { runAfterResponse } from "@/lib/http/after-response";
import { getOrderAccessCookie, setOrderAccessCookie } from "@/lib/payments/order-access-cookie";
import { verifyOrderAccessLinkToken } from "@/lib/payments/order-access-link";
import { logSecurityEvent } from "@/lib/observability/security-events";
import { scheduleDueOrderReadyPushProcessing } from "@/lib/push/order-ready";
import {
  getOrderAccessToken,
  getOrderPaymentSnapshot,
  isOrderAccessDeniedError,
  scheduleDuePendingTrackedPaymentRecovery,
} from "@/lib/payments/order-payments";
import { enforceRateLimit } from "@/lib/rate-limit";

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function GET(request: Request) {
  const rateLimit = await enforceRateLimit(request, "payment-status", 18, 60_000);
  if (!rateLimit.allowed) {
    logSecurityEvent({
      event: "payment_status_rate_limited",
      severity: "warning",
      request,
      details: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      report: {
        thresholds: [5, 10, 25],
      },
    });
    return tooManyRequests(rateLimit.retryAfterSeconds);
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId")?.trim();
  const orderAccessLinkToken = searchParams.get("access")?.trim();
  const hint = searchParams.get("hint") === "cancelled" ? "cancelled" : undefined;
  const refresh = searchParams.get("refresh") !== "0";

  if (!orderId) {
    return NextResponse.json({ message: "Missing orderId." }, { status: 400 });
  }
  let accessToken = await getOrderAccessCookie(orderId);
  let shouldRefreshOrderAccessCookie = false;

  if (!accessToken && orderAccessLinkToken) {
    const storedOrderAccessToken = await getOrderAccessToken(orderId);
    if (
      storedOrderAccessToken
      && verifyOrderAccessLinkToken({
        token: orderAccessLinkToken,
        orderId,
        accessToken: storedOrderAccessToken,
      })
    ) {
      accessToken = storedOrderAccessToken;
      shouldRefreshOrderAccessCookie = true;
    } else {
      logSecurityEvent({
        event: "payment_status_invalid_access_link",
        severity: "warning",
        request,
        details: {
          orderId,
        },
        report: {
          thresholds: [3, 5, 10],
        },
      });
    }
  }

  if (!accessToken) {
    logSecurityEvent({
      event: "payment_status_missing_access_session",
      severity: "warning",
      request,
      details: {
        orderId,
      },
      report: {
        thresholds: [5, 10, 25],
      },
    });
    return NextResponse.json({ message: "Missing order access session." }, { status: 403 });
  }

  runAfterResponse(async () => {
    await scheduleDuePendingTrackedPaymentRecovery("payment_status");
    await scheduleDueOrderReadyPushProcessing("payment_status");
  });

  console.info("STATUS_ROUTE", {
    orderId,
    refresh,
    hint: hint ?? null,
  });

  try {
    const snapshot = await getOrderPaymentSnapshot(orderId, {
      refresh,
      hint,
      accessToken,
      requireAccessToken: true,
    });
    const response = NextResponse.json({ ok: true, order: snapshot });
    if (shouldRefreshOrderAccessCookie) {
      setOrderAccessCookie(response, orderId, accessToken);
    }
    return response;
  } catch (error) {
    if (isOrderAccessDeniedError(error)) {
      logSecurityEvent({
        event: "payment_status_access_denied",
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
      { message: error instanceof Error ? error.message : "Unable to fetch payment status." },
      { status: 500 },
    );
  }
}
