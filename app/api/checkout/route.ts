import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getOrderPaymentSnapshot,
  initiateOrderPaymentForOrder,
} from "@/lib/payments/order-payments";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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
  orderTrackingId?: string;
  paymentStatus?: string;
};

type CheckoutIdempotencyRow = {
  key: string;
  endpoint: string;
  request_hash: string;
  resource_id: string | null;
  response_status: number | null;
  response_body: StoredCheckoutResponse | null;
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
    .select("key,endpoint,request_hash,resource_id,response_status,response_body")
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
) {
  if (row.response_status !== null && row.response_body) {
    return NextResponse.json(row.response_body, { status: row.response_status });
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
    const payment = await initiateOrderPaymentForOrder(row.resource_id, {
      requestOrigin,
    });
    const responseBody = {
      ok: true,
      id: row.resource_id,
      redirectUrl: payment.redirectUrl,
      orderTrackingId: payment.orderTrackingId,
      paymentStatus: payment.paymentStatus,
    };
    await finalizeCheckoutAttempt(row.key, 200, responseBody);
    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "Order has already been paid.") {
      const snapshot = await getOrderPaymentSnapshot(row.resource_id, { refresh: false });
      const responseBody = {
        ok: true,
        id: row.resource_id,
        paymentStatus: snapshot.paymentStatus,
      };
      await finalizeCheckoutAttempt(row.key, 200, responseBody);
      return NextResponse.json(responseBody, { status: 200 });
    }

    console.error("checkout_payment_resume_failed", {
      orderId: row.resource_id,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ message: "Unable to initiate payment." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const rateLimit = enforceRateLimit(request, "checkout", 12, 60_000);
  if (!rateLimit.allowed) {
    return tooManyRequests(rateLimit.retryAfterSeconds);
  }

  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return badRequest("Missing Idempotency-Key header");
  }

  const body = await request.json();
  const parsed = checkoutPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid checkout payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.items.length === 0) {
    return badRequest("Cart cannot be empty");
  }

  const requestHash = buildCheckoutRequestHash(parsed.data);
  const existingAttempt = await getStoredCheckoutAttempt(idempotencyKey);
  if (existingAttempt.errorResponse) {
    return existingAttempt.errorResponse;
  }

  if (existingAttempt.data) {
    if (
      existingAttempt.data.endpoint !== "checkout"
      || existingAttempt.data.request_hash !== requestHash
    ) {
      return conflict("Idempotency key cannot be reused with a different checkout payload.");
    }

    return resumeCheckoutAttempt(existingAttempt.data, requestOrigin);
  }

  const canonical = await loadCanonicalItems(parsed.data.items);
  if (canonical.response) {
    return canonical.response;
  }

  const items = canonical.items;
  const totalUGX = items.reduce((sum, item) => sum + item.priceUGX * item.quantity, 0);
  const orderId = randomUUID();
  const supabase = getSupabaseServerClient();

  console.info("CHECKOUT_INIT", {
    orderId,
    merchantReference: orderId,
    amount: totalUGX,
    isRetry: false,
    idempotencyKey,
  });

  const reservation = await supabase.from("api_idempotency_keys").insert({
    key: idempotencyKey,
    endpoint: "checkout",
    request_hash: requestHash,
    resource_id: orderId,
  });

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

      return resumeCheckoutAttempt(retryAttempt.data, requestOrigin);
    }

    console.error("checkout_idempotency_reservation_failed", reservation.error.message);
    return NextResponse.json({ message: "Unable to place order." }, { status: 500 });
  }

  const { customer } = parsed.data;
  const { error } = await supabase.rpc("place_guest_order", {
    order_id: orderId,
    order_total_ugx: totalUGX,
    order_status: "Pending",
    order_delivery_method: customer.deliveryMethod,
    order_customer_name: customer.customerName,
    order_phone: customer.phone,
    order_email: customer.email || "",
    order_address: customer.address || "",
    order_delivery_date: customer.deliveryDate || null,
    order_notes: customer.notes || "",
    order_items: items.map((item) => ({
      product_id: item.productId || null,
      name: item.name,
      image: item.image,
      price_ugx: item.priceUGX,
      quantity: item.quantity,
      selected_size: item.selectedSize ?? null,
      selected_flavor: item.selectedFlavor ?? null,
    })),
  });

  if (error) {
    console.error("checkout_place_guest_order_failed", error.message);
    const recoveredAttempt = await getStoredCheckoutAttempt(idempotencyKey);
    if (recoveredAttempt.data) {
      return resumeCheckoutAttempt(recoveredAttempt.data, requestOrigin);
    }

    await releaseCheckoutAttempt(idempotencyKey);
    return NextResponse.json({ message: "Unable to place order." }, { status: 500 });
  }

  let payment;
  try {
    payment = await initiateOrderPaymentForOrder(orderId, {
      requestOrigin,
    });
  } catch (paymentError) {
    console.error("checkout_payment_initiation_failed", {
      orderId,
      error: paymentError instanceof Error ? paymentError.message : "unknown error",
    });
    return NextResponse.json({ message: "Unable to initiate payment." }, { status: 500 });
  }

  const responseBody = {
    ok: true,
    id: orderId,
    redirectUrl: payment.redirectUrl,
    orderTrackingId: payment.orderTrackingId,
    paymentStatus: payment.paymentStatus,
  };
  await finalizeCheckoutAttempt(idempotencyKey, 200, responseBody);

  return NextResponse.json(responseBody, { status: 200 });
}
