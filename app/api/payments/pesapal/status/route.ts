import { NextResponse } from "next/server";
import { getOrderAccessCookie } from "@/lib/payments/order-access-cookie";
import {
  getOrderPaymentSnapshot,
  isOrderAccessDeniedError,
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
    return tooManyRequests(rateLimit.retryAfterSeconds);
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId")?.trim();
  const hint = searchParams.get("hint") === "cancelled" ? "cancelled" : undefined;
  const refresh = searchParams.get("refresh") !== "0";

  if (!orderId) {
    return NextResponse.json({ message: "Missing orderId." }, { status: 400 });
  }
  const accessToken = await getOrderAccessCookie(orderId);
  if (!accessToken) {
    return NextResponse.json({ message: "Missing order access session." }, { status: 403 });
  }

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
    return NextResponse.json({ ok: true, order: snapshot });
  } catch (error) {
    if (isOrderAccessDeniedError(error)) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to fetch payment status." },
      { status: 500 },
    );
  }
}
