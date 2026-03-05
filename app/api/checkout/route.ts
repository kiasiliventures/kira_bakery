import { NextResponse } from "next/server";
import { z } from "zod";
import { generateId } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkoutSchema } from "@/lib/validation";

const checkoutPayloadSchema = z.object({
  customer: checkoutSchema,
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string().min(1),
      image: z.string().min(1),
      priceUGX: z.number().int().min(0),
      quantity: z.number().int().positive(),
      selectedSize: z.string().optional(),
      selectedFlavor: z.string().optional(),
    }),
  ),
  totalUGX: z.number().int().min(0),
});

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
    return NextResponse.json({ message: "Cart cannot be empty" }, { status: 400 });
  }

  const orderId = generateId("order");
  const supabase = getSupabaseServerClient();
  const { customer, items, totalUGX } = parsed.data;

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
    return NextResponse.json({ message: orderError.message }, { status: 500 });
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
    return NextResponse.json({ message: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: orderId });
}
