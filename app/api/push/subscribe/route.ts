import { NextResponse } from "next/server";
import { z } from "zod";
import { validateSameOriginMutation } from "@/lib/http/same-origin";
import { getOrderAccessCookie } from "@/lib/payments/order-access-cookie";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAuthenticatedUser, getSupabaseServerClient } from "@/lib/supabase/server";

const pushSubscriptionSchema = z.object({
  orderId: z.string().uuid().optional(),
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1, "Missing p256dh key."),
    auth: z.string().min(1, "Missing auth key."),
  }),
});

function inferPlatform(userAgent: string | null) {
  const value = userAgent?.toLowerCase() ?? "";

  if (value.includes("iphone") || value.includes("ipad") || value.includes("ipod")) {
    return "ios";
  }

  if (value.includes("android")) {
    return "android";
  }

  if (value.includes("windows")) {
    return "windows";
  }

  if (value.includes("mac os") || value.includes("macintosh")) {
    return "macos";
  }

  if (value.includes("linux")) {
    return "linux";
  }

  return "web";
}

async function authorizeOrderLink(orderId: string, authenticatedUserId: string | null) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id,customer_id,order_access_token")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to verify order access for push subscription: ${error.message}`);
  }

  if (!data) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "Order not found." }, { status: 404 }),
    };
  }

  const accessToken = await getOrderAccessCookie(orderId);

  if (data.customer_id) {
    if (authenticatedUserId && authenticatedUserId === data.customer_id) {
      return {
        ok: true as const,
        customerId: data.customer_id,
        canLinkToCustomerId: true,
      };
    }

    if (!accessToken || accessToken !== data.order_access_token) {
      return {
        ok: false as const,
        response: NextResponse.json({ message: "Unauthorized for this order." }, { status: 403 }),
      };
    }

    return {
      ok: true as const,
      customerId: data.customer_id,
      canLinkToCustomerId: false,
    };
  }

  if (!accessToken || accessToken !== data.order_access_token) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: "Missing valid order access session." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    customerId: null,
    canLinkToCustomerId: false,
  };
}

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request: Request) {
  try {
    const sameOriginViolation = validateSameOriginMutation(request);
    if (sameOriginViolation) {
      return sameOriginViolation;
    }

    const routeRateLimit = await enforceRateLimit(request, "push-subscribe", 10, 60_000);
    if (!routeRateLimit.allowed) {
      return tooManyRequests(routeRateLimit.retryAfterSeconds);
    }

    const body = await request.json().catch(() => null);
    const parsed = pushSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Invalid push subscription payload.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const authenticatedUser = await getAuthenticatedUser();
    const authenticatedUserId = authenticatedUser?.id ?? null;
    let subscriptionUserId = authenticatedUserId;

    if (parsed.data.orderId) {
      const orderRateLimit = await enforceRateLimit(
        request,
        `push-subscribe-order:${parsed.data.orderId}`,
        6,
        60_000,
      );
      if (!orderRateLimit.allowed) {
        return tooManyRequests(orderRateLimit.retryAfterSeconds);
      }

      const authorizedOrder = await authorizeOrderLink(parsed.data.orderId, authenticatedUserId);
      if (!authorizedOrder.ok) {
        return authorizedOrder.response;
      }

      subscriptionUserId = authorizedOrder.canLinkToCustomerId
        ? authorizedOrder.customerId
        : null;
    } else if (!authenticatedUserId) {
      return NextResponse.json(
        { message: "orderId is required when no authenticated user is present." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServerClient();
    const { data: storedSubscription, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          user_id: subscriptionUserId,
          platform: inferPlatform(request.headers.get("user-agent")),
          user_agent: request.headers.get("user-agent"),
        },
        {
          onConflict: "endpoint",
        },
      )
      .select("id")
      .single();

    if (subscriptionError || !storedSubscription) {
      throw new Error(subscriptionError?.message ?? "Unable to save push subscription.");
    }

    if (parsed.data.orderId) {
      const { error: relationError } = await supabase
        .from("push_subscription_orders")
        .upsert(
          {
            subscription_id: storedSubscription.id,
            order_id: parsed.data.orderId,
          },
          {
            onConflict: "subscription_id,order_id",
            ignoreDuplicates: true,
          },
        );

      if (relationError) {
        throw new Error(`Unable to link push subscription to order: ${relationError.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      subscriptionId: storedSubscription.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to store push subscription.",
      },
      { status: 500 },
    );
  }
}
