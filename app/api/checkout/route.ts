import { NextResponse } from "next/server";
import { z } from "zod";
import { generateId } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkoutSchema } from "@/lib/validation";

type ModernCheckoutProductRow = {
  id: string;
  name: string;
  image: string;
  price_ugx: number;
  sold_out: boolean;
};

type LegacyCheckoutVariantRow = {
  name: string;
  price: number;
  is_available: boolean;
  sort_order?: number | null;
};

type LegacyCheckoutProductRow = {
  id: string;
  name: string;
  image_url: string | null;
  is_available: boolean;
  product_variants?: LegacyCheckoutVariantRow[] | null;
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

function selectLegacyVariant(
  product: LegacyCheckoutProductRow,
  selectedSize?: string,
): LegacyCheckoutVariantRow | null {
  const availableVariants = (product.product_variants ?? [])
    .filter((variant) => variant.is_available)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (availableVariants.length === 0) {
    return null;
  }

  if (!selectedSize) {
    return availableVariants[0];
  }

  return (
    availableVariants.find((variant) => variant.name === selectedSize) ??
    availableVariants[0]
  );
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

  const { data, error } = await supabase
    .from("products")
    .select("id,name,image,price_ugx,sold_out")
    .in("id", productIds);

  if (error?.code === "42703") {
    const legacy = await supabase
      .from("products")
      .select(
        "id,name,image_url,is_available,product_variants(name,price,is_available,sort_order)",
      )
      .eq("is_published", true)
      .in("id", productIds);

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

  if (error) {
    console.error("checkout_product_lookup_failed", error.message);
    return { response: NextResponse.json({ message: "Unable to validate cart items." }, { status: 500 }) };
  }

  const products = new Map(
    ((data ?? []) as ModernCheckoutProductRow[]).map((product) => [product.id, product]),
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

export async function POST(request: Request) {
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

  const canonical = await loadCanonicalItems(parsed.data.items);
  if (canonical.response) {
    return canonical.response;
  }

  const items = canonical.items;
  const totalUGX = items.reduce((sum, item) => sum + item.priceUGX * item.quantity, 0);
  const orderId = generateId("order");
  const supabase = getSupabaseServerClient();
  const { customer } = parsed.data;

  const { error: orderError } = await supabase.from("orders").insert({
    id: orderId,
    total_ugx: totalUGX,
    status: "Pending",
    delivery_method: customer.deliveryMethod,
    customer_name: customer.customerName,
    phone: customer.phone,
    email: customer.email || null,
    address: customer.address || null,
    delivery_date: customer.deliveryDate || null,
    notes: customer.notes || null,
  });

  if (orderError) {
    console.error("checkout_order_insert_failed", orderError.message);
    return NextResponse.json({ message: "Unable to place order." }, { status: 500 });
  }

  const { error: itemsError } = await supabase.from("order_items").insert(
    items.map((item) => ({
      order_id: orderId,
      product_id: item.productId || null,
      name: item.name,
      image: item.image,
      price_ugx: item.priceUGX,
      quantity: item.quantity,
      selected_size: item.selectedSize ?? null,
      selected_flavor: item.selectedFlavor ?? null,
    })),
  );

  if (itemsError) {
    console.error("checkout_order_items_insert_failed", itemsError.message);
    return NextResponse.json({ message: "Unable to place order." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: orderId });
}
