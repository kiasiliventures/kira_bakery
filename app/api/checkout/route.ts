import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureCustomerForUser } from "@/lib/customers";
import { setOrderAccessCookie } from "@/lib/payments/order-access-cookie";
import { verifyDeliveryQuoteToken } from "@/lib/delivery/quote-token";
import { validateSameOriginMutation } from "@/lib/http/same-origin";
import { logSecurityEvent } from "@/lib/observability/security-events";
import {
  getOrderAccessToken,
  getOrderPaymentSnapshot,
  initiateOrderPaymentForOrder,
} from "@/lib/payments/order-payments";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAuthenticatedUser, getSupabaseServerClient } from "@/lib/supabase/server";
import { checkoutSchema } from "@/lib/validation";

type SharedCheckoutProductRow = {
  id: string;
  name: string;
  image_url: string | null;
  base_price: string | number;
  stock_quantity: number;
  is_available: boolean;
};

type LegacyCheckoutProductRow = {
  id: string;
  name: string;
  image: string;
  price_ugx: number;
  sold_out: boolean;
};

type LegacyAdminVariantRow = {
  name: string;
  price: number;
  is_available: boolean;
  sort_order?: number | null;
};

type LegacyAdminProductRow = {
  id: string;
  name: string;
  image_url: string | null;
  is_available: boolean;
  product_variants?: LegacyAdminVariantRow[] | null;
};

type CanonicalCheckoutItem = {
  productId: string;
  name: string;
  image: string;
  priceUGX: number;
  quantity: number;
  selectedSize?: string;
  selectedFlavor?: string;
};

type StoredCheckoutResponse = {
  ok?: boolean;
  id?: string;
  message?: string;
  redirectUrl?: string;
  paymentStatus?: string;
};

type CheckoutIdempotencyRow = {
  key: string;
  endpoint: string;
  request_hash: string;
  client_binding_hash: string | null;
  resource_id: string | null;
  response_status: number | null;
  response_body: StoredCheckoutResponse | null;
};

type TimingEntry = {
  name: string;
  durationMs: number;
};

type SharedPlaceOrderPayload = {
  order_id: string;
  order_access_token: string;
  order_total_ugx: number;
  order_fulfillment_method: "delivery" | "pickup";
  order_customer_name: string;
  order_phone: string;
  order_email: string;
  order_delivery_address_text: string;
  order_delivery_date: string | null;
  order_notes: string;
  order_delivery_place_id: string | null;
  order_delivery_latitude: number | null;
  order_delivery_longitude: number | null;
  order_delivery_distance_km: number | null;
  order_delivery_fee: number;
  order_delivery_pricing_config_id: string | null;
  order_delivery_store_location_id: string | null;
  order_items: Array<{
    product_id: string | null;
    name: string;
    image: string;
    price_ugx: number;
    quantity: number;
    selected_size: string | null;
    selected_flavor: string | null;
  }>;
};

type GuestPlaceOrderRpcPayload = SharedPlaceOrderPayload & {
  order_status: "Pending";
};

const checkoutPayloadSchema = z.object({
  customer: checkoutSchema,
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().positive(),
      selectedSize: z.string().optional(),
      selectedFlavor: z.string().optional(),
    }),
  ),
});

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

function conflict(message: string) {
  return NextResponse.json({ message }, { status: 409 });
}

function startTiming() {
  return performance.now();
}

function recordTiming(
  timings: TimingEntry[],
  name: string,
  startedAt: number,
) {
  timings.push({
    name,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  });
}

function setServerTimingHeaders(response: NextResponse, timings: TimingEntry[]) {
  if (timings.length === 0) {
    return;
  }

  response.headers.set(
    "Server-Timing",
    timings
      .map((entry) => `${entry.name};dur=${entry.durationMs}`)
      .join(", "),
  );
}

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

function getIdempotencyKey(request: Request) {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key || key.length > 128) {
    return null;
  }
  return key;
}

function getCheckoutSessionToken(request: Request) {
  const token = request.headers.get("X-Checkout-Session")?.trim();
  if (!token || token.length > 200) {
    return null;
  }
  return token;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildCheckoutRequestHash(payload: z.infer<typeof checkoutPayloadSchema>) {
  return createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

function buildCheckoutSessionBindingHash(sessionToken: string) {
  return createHash("sha256").update(sessionToken).digest("hex");
}

function hasMatchingCheckoutBinding(
  row: CheckoutIdempotencyRow,
  sessionBindingHash: string,
) {
  return row.client_binding_hash !== null && row.client_binding_hash === sessionBindingHash;
}

function buildInsufficientStockMessage(productName: string, stockQuantity: number) {
  if (stockQuantity <= 0) {
    return `${productName} is unavailable.`;
  }

  return `Only ${stockQuantity} piece${stockQuantity === 1 ? "" : "s"} of ${productName} ${
    stockQuantity === 1 ? "is" : "are"
  } left.`;
}

function buildPlaceOrderRpcPayload(input: {
  orderId: string;
  orderAccessToken: string;
  totalUGX: number;
  customer: z.infer<typeof checkoutSchema>;
  deliveryQuote: {
    destination: {
      addressText: string;
      placeId: string;
      latitude: number;
      longitude: number;
    };
    distanceKm: number;
    deliveryFee: number;
    pricingConfigId: string;
    storeLocationId: string;
  } | null;
  items: CanonicalCheckoutItem[];
}): SharedPlaceOrderPayload {
  const { customer, deliveryQuote, items } = input;

  return {
    order_id: input.orderId,
    order_access_token: input.orderAccessToken,
    order_total_ugx: input.totalUGX,
    order_fulfillment_method: customer.deliveryMethod,
    order_customer_name: customer.customerName,
    order_phone: customer.phone,
    order_email: customer.email || "",
    order_delivery_address_text:
      customer.deliveryMethod === "delivery"
        ? deliveryQuote?.destination.addressText ?? customer.address ?? ""
        : "",
    order_delivery_date: customer.deliveryDate || null,
    order_notes: customer.notes || "",
    order_delivery_place_id:
      customer.deliveryMethod === "delivery"
        ? deliveryQuote?.destination.placeId ?? customer.deliveryLocation?.placeId ?? null
        : null,
    order_delivery_latitude:
      customer.deliveryMethod === "delivery" ? deliveryQuote?.destination.latitude ?? null : null,
    order_delivery_longitude:
      customer.deliveryMethod === "delivery" ? deliveryQuote?.destination.longitude ?? null : null,
    order_delivery_distance_km:
      customer.deliveryMethod === "delivery" ? deliveryQuote?.distanceKm ?? null : null,
    order_delivery_fee:
      customer.deliveryMethod === "delivery" ? deliveryQuote?.deliveryFee ?? 0 : 0,
    order_delivery_pricing_config_id:
      customer.deliveryMethod === "delivery" ? deliveryQuote?.pricingConfigId ?? null : null,
    order_delivery_store_location_id:
      customer.deliveryMethod === "delivery" ? deliveryQuote?.storeLocationId ?? null : null,
    order_items: items.map((item) => ({
      product_id: item.productId || null,
      name: item.name,
      image: item.image,
      price_ugx: item.priceUGX,
      quantity: item.quantity,
      selected_size: item.selectedSize ?? null,
      selected_flavor: item.selectedFlavor ?? null,
    })),
  };
}

function selectLegacyVariant(
  product: LegacyAdminProductRow,
  selectedSize?: string,
): LegacyAdminVariantRow | null {
  const availableVariants = (product.product_variants ?? [])
    .filter((variant) => variant.is_available)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (availableVariants.length === 0) {
    return null;
  }

  if (!selectedSize) {
    return availableVariants[0];
  }

  return availableVariants.find((variant) => variant.name === selectedSize) ?? availableVariants[0];
}

async function loadCanonicalItems(
  requestedItems: Array<{
    productId: string;
    quantity: number;
    selectedSize?: string;
    selectedFlavor?: string;
  }>,
) {
  const supabase = getSupabaseServerClient();
  const productIds = [...new Set(requestedItems.map((item) => item.productId))];

  const shared = await supabase
    .from("products")
    .select("id,name,image_url,base_price,stock_quantity,is_available")
    .in("id", productIds);

  if (shared.error?.code === "42703") {
    const legacy = await supabase
      .from("products")
      .select("id,name,image,price_ugx,sold_out")
      .in("id", productIds);

    if (legacy.error?.code === "42703") {
      const legacyAdmin = await supabase
        .from("products")
        .select(
          "id,name,image_url,is_available,product_variants(name,price,is_available,sort_order)",
        )
        .in("id", productIds);

      if (legacyAdmin.error) {
        console.error("checkout_legacy_admin_product_lookup_failed", legacyAdmin.error.message);
        return {
          response: NextResponse.json({ message: "Unable to validate cart items." }, { status: 500 }),
        };
      }

      const products = new Map(
        ((legacyAdmin.data ?? []) as LegacyAdminProductRow[]).map((product) => [product.id, product]),
      );

      const canonicalItems: CanonicalCheckoutItem[] = [];

      for (const item of requestedItems) {
        const product = products.get(item.productId);
        if (!product) {
          return { response: badRequest("One or more cart items no longer exist.") };
        }
        if (!product.is_available) {
          return { response: badRequest(`${product.name} is unavailable.`) };
        }

        const variant = selectLegacyVariant(product, item.selectedSize);
        if (!variant) {
          return { response: badRequest(`${product.name} has no valid price configured.`) };
        }

        canonicalItems.push({
          productId: product.id,
          name: product.name,
          image: product.image_url ?? "",
          priceUGX: Math.round(Number(variant.price)),
          quantity: item.quantity,
          selectedSize: item.selectedSize,
          selectedFlavor: item.selectedFlavor,
        });
      }

      return { items: canonicalItems };
    }

    if (legacy.error) {
      console.error("checkout_legacy_product_lookup_failed", legacy.error.message);
      return { response: NextResponse.json({ message: "Unable to validate cart items." }, { status: 500 }) };
    }

    const products = new Map(
      ((legacy.data ?? []) as LegacyCheckoutProductRow[]).map((product) => [product.id, product]),
    );
    const canonicalItems: CanonicalCheckoutItem[] = [];

    for (const item of requestedItems) {
      const product = products.get(item.productId);
      if (!product) {
        return { response: badRequest("One or more cart items no longer exist.") };
      }
      if (product.sold_out) {
        return { response: badRequest(`${product.name} is unavailable.`) };
      }

      canonicalItems.push({
        productId: product.id,
        name: product.name,
        image: product.image,
        priceUGX: product.price_ugx,
        quantity: item.quantity,
        selectedSize: item.selectedSize,
        selectedFlavor: item.selectedFlavor,
      });
    }

    return { items: canonicalItems };
  }

  if (shared.error) {
    console.error("checkout_product_lookup_failed", shared.error.message);
    return { response: NextResponse.json({ message: "Unable to validate cart items." }, { status: 500 }) };
  }

  const products = new Map(
    ((shared.data ?? []) as SharedCheckoutProductRow[]).map((product) => [product.id, product]),
  );
  const canonicalItems: CanonicalCheckoutItem[] = [];

  for (const item of requestedItems) {
    const product = products.get(item.productId);
    if (!product) {
      return { response: badRequest("One or more cart items no longer exist.") };
    }
    if (!product.is_available || product.stock_quantity <= 0) {
      return { response: badRequest(`${product.name} is unavailable.`) };
    }
    if (item.quantity > product.stock_quantity) {
      return {
        response: badRequest(
          buildInsufficientStockMessage(product.name, product.stock_quantity),
        ),
      };
    }

    canonicalItems.push({
      productId: product.id,
      name: product.name,
      image: product.image_url ?? "",
      priceUGX: Math.round(Number(product.base_price)),
      quantity: item.quantity,
      selectedSize: item.selectedSize,
      selectedFlavor: item.selectedFlavor,
    });
  }

  return { items: canonicalItems };
}

async function getStoredCheckoutAttempt(key: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_idempotency_keys")
    .select("key,endpoint,request_hash,client_binding_hash,resource_id,response_status,response_body")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error("checkout_idempotency_lookup_failed", error.message);
    return { errorResponse: NextResponse.json({ message: "Unable to place order." }, { status: 500 }) };
  }

  return { data: (data as CheckoutIdempotencyRow | null) ?? null };
}

async function finalizeCheckoutAttempt(
  key: string,
  status: number,
  responseBody: StoredCheckoutResponse,
) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("api_idempotency_keys")
    .update({
      response_status: status,
      response_body: responseBody,
      completed_at: new Date().toISOString(),
    })
    .eq("key", key);

  if (error) {
    console.error("checkout_idempotency_finalize_failed", error.message);
  }
}

async function releaseCheckoutAttempt(key: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("api_idempotency_keys").delete().eq("key", key);

  if (error) {
    console.error("checkout_idempotency_release_failed", error.message);
  }
}

async function resumeCheckoutAttempt(
  row: CheckoutIdempotencyRow,
  requestOrigin: string,
  sessionBindingHash: string,
  request?: Request,
) {
  const timings: TimingEntry[] = [];
  const resumeStartedAt = startTiming();

  if (!hasMatchingCheckoutBinding(row, sessionBindingHash)) {
    if (request) {
      logSecurityEvent({
        event: "checkout_resume_binding_mismatch",
        severity: "warning",
        request,
        details: {
          idempotencyKey: row.key,
          orderId: row.resource_id,
        },
        report: {
          thresholds: [2, 5, 10],
        },
      });
    }
    return conflict(
      "This checkout retry belongs to a different browser session. Please start a new checkout.",
    );
  }

  if (row.response_status !== null && row.response_body) {
    const response = NextResponse.json(row.response_body, { status: row.response_status });
    if (row.resource_id) {
      const accessTokenLookupStartedAt = startTiming();
      const accessToken = await getOrderAccessToken(row.resource_id);
      recordTiming(timings, "checkout_resume_token_lookup", accessTokenLookupStartedAt);
      if (accessToken) {
        setOrderAccessCookie(response, row.resource_id, accessToken);
      }
    }
    recordTiming(timings, "checkout_resume_total", resumeStartedAt);
    setServerTimingHeaders(response, timings);
    return response;
  }

  if (!row.resource_id) {
    return conflict("This checkout is already being processed. Please wait and try again.");
  }

  console.info("CHECKOUT_INIT", {
    orderId: row.resource_id,
    merchantReference: row.resource_id,
    amount: null,
    isRetry: true,
    idempotencyKey: row.key,
  });

  try {
    const accessTokenLookupStartedAt = startTiming();
    const accessToken = await getOrderAccessToken(row.resource_id);
    recordTiming(timings, "checkout_resume_token_lookup", accessTokenLookupStartedAt);
    const paymentInitiationStartedAt = startTiming();
    const payment = await initiateOrderPaymentForOrder(row.resource_id, {
      requestOrigin,
    });
    recordTiming(timings, "checkout_resume_payment_init", paymentInitiationStartedAt);
    const responseBody = {
      ok: true,
      id: row.resource_id,
      redirectUrl: payment.redirectUrl,
      paymentStatus: payment.paymentStatus,
    };
    const finalizeStartedAt = startTiming();
    await finalizeCheckoutAttempt(row.key, 200, responseBody);
    recordTiming(timings, "checkout_resume_finalize", finalizeStartedAt);
    const response = NextResponse.json(responseBody, { status: 200 });
    if (accessToken) {
      setOrderAccessCookie(response, row.resource_id, accessToken);
    }
    recordTiming(timings, "checkout_resume_total", resumeStartedAt);
    setServerTimingHeaders(response, timings);
    console.info("checkout_resume_timing", {
      orderId: row.resource_id,
      timings,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "Order has already been paid.") {
      const accessTokenLookupStartedAt = startTiming();
      const accessToken = await getOrderAccessToken(row.resource_id);
      recordTiming(timings, "checkout_resume_token_lookup", accessTokenLookupStartedAt);
      const snapshotStartedAt = startTiming();
      const snapshot = await getOrderPaymentSnapshot(row.resource_id, { refresh: false });
      recordTiming(timings, "checkout_resume_snapshot", snapshotStartedAt);
      const responseBody = {
        ok: true,
        id: row.resource_id,
        paymentStatus: snapshot.paymentStatus,
      };
      const finalizeStartedAt = startTiming();
      await finalizeCheckoutAttempt(row.key, 200, responseBody);
      recordTiming(timings, "checkout_resume_finalize", finalizeStartedAt);
      const response = NextResponse.json(responseBody, { status: 200 });
      if (accessToken) {
        setOrderAccessCookie(response, row.resource_id, accessToken);
      }
      recordTiming(timings, "checkout_resume_total", resumeStartedAt);
      setServerTimingHeaders(response, timings);
      console.info("checkout_resume_timing", {
        orderId: row.resource_id,
        timings,
      });
      return response;
    }

    console.error("checkout_payment_resume_failed", {
      orderId: row.resource_id,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ message: "Unable to initiate payment." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const sameOriginViolation = validateSameOriginMutation(request);
  if (sameOriginViolation) {
    return sameOriginViolation;
  }

  const timings: TimingEntry[] = [];
  const checkoutStartedAt = startTiming();
  const requestOrigin = new URL(request.url).origin;
  const rateLimitStartedAt = startTiming();
  const rateLimit = await enforceRateLimit(request, "checkout", 12, 60_000);
  recordTiming(timings, "checkout_rate_limit", rateLimitStartedAt);
  if (!rateLimit.allowed) {
    logSecurityEvent({
      event: "checkout_rate_limited",
      severity: "warning",
      request,
      details: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      report: {
        thresholds: [5, 10, 25],
      },
    });
    const response = tooManyRequests(rateLimit.retryAfterSeconds);
    recordTiming(timings, "checkout_total", checkoutStartedAt);
    setServerTimingHeaders(response, timings);
    return response;
  }

  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return badRequest("Missing Idempotency-Key header");
  }
  const checkoutSessionToken = getCheckoutSessionToken(request);
  if (!checkoutSessionToken) {
    return badRequest("Missing X-Checkout-Session header");
  }
  const sessionBindingHash = buildCheckoutSessionBindingHash(checkoutSessionToken);

  const parseBodyStartedAt = startTiming();
  const body = await request.json();
  recordTiming(timings, "checkout_parse_body", parseBodyStartedAt);
  const parsed = checkoutPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const response = NextResponse.json(
      { message: "Invalid checkout payload", issues: parsed.error.issues },
      { status: 400 },
    );
    recordTiming(timings, "checkout_total", checkoutStartedAt);
    setServerTimingHeaders(response, timings);
    return response;
  }

  if (parsed.data.items.length === 0) {
    return badRequest("Cart cannot be empty");
  }

  const requestHash = buildCheckoutRequestHash(parsed.data);
  const idempotencyLookupStartedAt = startTiming();
  const existingAttempt = await getStoredCheckoutAttempt(idempotencyKey);
  recordTiming(timings, "checkout_idempotency_lookup", idempotencyLookupStartedAt);
  if (existingAttempt.errorResponse) {
    recordTiming(timings, "checkout_total", checkoutStartedAt);
    setServerTimingHeaders(existingAttempt.errorResponse, timings);
    return existingAttempt.errorResponse;
  }

  if (existingAttempt.data) {
    if (
      existingAttempt.data.endpoint !== "checkout"
      || existingAttempt.data.request_hash !== requestHash
    ) {
      return conflict("Idempotency key cannot be reused with a different checkout payload.");
    }

    return resumeCheckoutAttempt(existingAttempt.data, requestOrigin, sessionBindingHash, request);
  }

  const canonicalItemsStartedAt = startTiming();
  const canonical = await loadCanonicalItems(parsed.data.items);
  recordTiming(timings, "checkout_load_items", canonicalItemsStartedAt);
  if (canonical.response) {
    recordTiming(timings, "checkout_total", checkoutStartedAt);
    setServerTimingHeaders(canonical.response, timings);
    return canonical.response;
  }

  const items = canonical.items;
  const subtotalUGX = items.reduce((sum, item) => sum + item.priceUGX * item.quantity, 0);
  let deliveryQuote = null as {
    destination: {
      addressText: string;
      placeId: string;
      latitude: number;
      longitude: number;
    };
    distanceKm: number;
    deliveryFee: number;
    pricingConfigId: string;
    storeLocationId: string;
  } | null;

  if (parsed.data.customer.deliveryMethod === "delivery") {
    try {
      const quoteVerificationStartedAt = startTiming();
      const verifiedQuote = verifyDeliveryQuoteToken(parsed.data.customer.deliveryQuoteToken ?? "");
      recordTiming(timings, "checkout_verify_delivery_quote", quoteVerificationStartedAt);
      if (verifiedQuote.destination.placeId !== parsed.data.customer.deliveryLocation?.placeId) {
        const response = badRequest("Delivery location no longer matches the verified quote. Please reselect it.");
        recordTiming(timings, "checkout_total", checkoutStartedAt);
        setServerTimingHeaders(response, timings);
        return response;
      }
      deliveryQuote = {
        destination: verifiedQuote.destination,
        distanceKm: verifiedQuote.distanceKm,
        deliveryFee: verifiedQuote.deliveryFee,
        pricingConfigId: verifiedQuote.pricingConfigId,
        storeLocationId: verifiedQuote.storeLocationId,
      };
    } catch (error) {
      console.error("checkout_delivery_quote_verification_failed", error);
      const response = NextResponse.json(
        { message: "Delivery quote has expired or is invalid. Please refresh it." },
        { status: 400 },
      );
      recordTiming(timings, "checkout_total", checkoutStartedAt);
      setServerTimingHeaders(response, timings);
      return response;
    }
  }

  const totalUGX = subtotalUGX + (deliveryQuote?.deliveryFee ?? 0);
  const orderId = randomUUID();
  const orderAccessToken = randomUUID();
  const supabase = getSupabaseServerClient();

  console.info("CHECKOUT_INIT", {
    orderId,
    merchantReference: orderId,
    amount: totalUGX,
    isRetry: false,
    idempotencyKey,
  });

  const reservationStartedAt = startTiming();
  const reservation = await supabase.from("api_idempotency_keys").insert({
    key: idempotencyKey,
    endpoint: "checkout",
    request_hash: requestHash,
    client_binding_hash: sessionBindingHash,
    resource_id: orderId,
  });
  recordTiming(timings, "checkout_idempotency_reserve", reservationStartedAt);

  if (reservation.error) {
    if (reservation.error.code === "23505") {
      const retryAttempt = await getStoredCheckoutAttempt(idempotencyKey);
      if (retryAttempt.errorResponse) {
        return retryAttempt.errorResponse;
      }

      if (!retryAttempt.data) {
        return NextResponse.json({ message: "Unable to place order." }, { status: 500 });
      }

      if (
        retryAttempt.data.endpoint !== "checkout"
        || retryAttempt.data.request_hash !== requestHash
      ) {
        return conflict("Idempotency key cannot be reused with a different checkout payload.");
      }

      const response = await resumeCheckoutAttempt(
        retryAttempt.data,
        requestOrigin,
        sessionBindingHash,
        request,
      );
      setServerTimingHeaders(response, timings);
      return response;
    }

    console.error("checkout_idempotency_reservation_failed", reservation.error.message);
    const response = NextResponse.json({ message: "Unable to place order." }, { status: 500 });
    recordTiming(timings, "checkout_total", checkoutStartedAt);
    setServerTimingHeaders(response, timings);
    return response;
  }

  const { customer } = parsed.data;
  const authenticatedUser = await getAuthenticatedUser();
  const authenticatedCustomer = authenticatedUser
    ? await ensureCustomerForUser(authenticatedUser, {
        checkoutName: customer.customerName,
        phone: customer.phone,
        defaultAddress:
          customer.deliveryMethod === "delivery"
            ? deliveryQuote?.destination.addressText ?? customer.address ?? null
            : null,
      })
    : null;
  const placeOrderStartedAt = startTiming();
  const placeOrderPayload = buildPlaceOrderRpcPayload({
    orderId,
    orderAccessToken,
    totalUGX,
    customer,
    deliveryQuote,
    items,
  });
  const guestPlaceOrderPayload: GuestPlaceOrderRpcPayload = {
    ...placeOrderPayload,
    order_status: "Pending",
  };
  const { error } = authenticatedCustomer
    ? await supabase.rpc("place_authenticated_order", {
        order_customer_id: authenticatedCustomer.id,
        ...placeOrderPayload,
      })
    : await supabase.rpc("place_guest_order", guestPlaceOrderPayload);
  recordTiming(timings, "checkout_place_order", placeOrderStartedAt);

  if (error) {
    console.error("checkout_place_guest_order_failed", error.message);
    const recoveredAttempt = await getStoredCheckoutAttempt(idempotencyKey);
    if (recoveredAttempt.data) {
      const response = await resumeCheckoutAttempt(
        recoveredAttempt.data,
        requestOrigin,
        sessionBindingHash,
        request,
      );
      setServerTimingHeaders(response, timings);
      return response;
    }

    await releaseCheckoutAttempt(idempotencyKey);
    const response = NextResponse.json({ message: "Unable to place order." }, { status: 500 });
    recordTiming(timings, "checkout_total", checkoutStartedAt);
    setServerTimingHeaders(response, timings);
    return response;
  }

  let payment;
  try {
    const paymentInitiationStartedAt = startTiming();
    payment = await initiateOrderPaymentForOrder(orderId, {
      requestOrigin,
    });
    recordTiming(timings, "checkout_payment_init", paymentInitiationStartedAt);
  } catch (paymentError) {
    console.error("checkout_payment_initiation_failed", {
      orderId,
      error: paymentError instanceof Error ? paymentError.message : "unknown error",
    });
    const response = NextResponse.json({ message: "Unable to initiate payment." }, { status: 500 });
    recordTiming(timings, "checkout_total", checkoutStartedAt);
    setServerTimingHeaders(response, timings);
    console.info("checkout_timing", {
      orderId,
      idempotencyKey,
      timings,
      outcome: "payment_initiation_failed",
    });
    return response;
  }

  const responseBody = {
    ok: true,
    id: orderId,
    redirectUrl: payment.redirectUrl,
    paymentStatus: payment.paymentStatus,
  };
  const finalizeStartedAt = startTiming();
  await finalizeCheckoutAttempt(idempotencyKey, 200, responseBody);
  recordTiming(timings, "checkout_finalize", finalizeStartedAt);

  const response = NextResponse.json(responseBody, { status: 200 });
  setOrderAccessCookie(response, orderId, orderAccessToken);
  recordTiming(timings, "checkout_total", checkoutStartedAt);
  setServerTimingHeaders(response, timings);
  console.info("checkout_timing", {
    orderId,
    idempotencyKey,
    timings,
    outcome: "success",
  });
  return response;
}
