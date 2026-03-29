import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getOrderAccessCookie, setOrderAccessCookie } from "@/lib/payments/order-access-cookie";
import { verifyOrderAccessLinkToken } from "@/lib/payments/order-access-link";
import {
  getOrderAccessToken,
  getOrderDetailSnapshot,
  isOrderAccessDeniedError,
} from "@/lib/payments/order-payments";
import { enforceRateLimit } from "@/lib/rate-limit";

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rateLimit = await enforceRateLimit(request, "order-detail", 18, 60_000);
  if (!rateLimit.allowed) {
    return tooManyRequests(rateLimit.retryAfterSeconds);
  }

  const params = await context.params;
  const orderId = params.id?.trim();
  if (!orderId) {
    return NextResponse.json({ message: "Missing orderId." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const orderAccessLinkToken = searchParams.get("access")?.trim();
  const refresh = searchParams.get("refresh") !== "0";
  const authenticatedUser = await getAuthenticatedUser();
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
    }
  }

  if (!authenticatedUser?.id && !accessToken) {
    return NextResponse.json({ message: "Missing order access session." }, { status: 403 });
  }

  try {
    const order = await getOrderDetailSnapshot(orderId, {
      refresh,
      authenticatedUserId: authenticatedUser?.id ?? null,
      accessToken,
      requireAuthorization: true,
    });
    const response = NextResponse.json({ ok: true, order });

    if (shouldRefreshOrderAccessCookie && accessToken) {
      setOrderAccessCookie(response, orderId, accessToken);
    }

    return response;
  } catch (error) {
    if (isOrderAccessDeniedError(error)) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to fetch order details." },
      { status: 500 },
    );
  }
}
