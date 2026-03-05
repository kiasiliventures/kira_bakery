import { NextResponse } from "next/server";
import { generateId } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { cakeBuilderSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = cakeBuilderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid cake builder payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const orderId = generateId("cake-order");
  const cakeRequestId = generateId("cake");
  const supabase = getSupabaseServerClient();

  const { error: orderError } = await supabase.from("orders").insert({
    id: orderId,
    total_ugx: parsed.data.budgetMax,
    status: "Pending",
    delivery_method: "pickup",
    customer_name: "Guest Cake Request",
    phone: "+256000000000",
    address: "Kira",
    delivery_date: parsed.data.eventDate,
  });

  if (orderError) {
    return NextResponse.json({ message: orderError.message }, { status: 500 });
  }

  const { error: cakeError } = await supabase.from("cake_requests").insert({
    id: cakeRequestId,
    order_id: orderId,
    flavor: parsed.data.flavor,
    size: parsed.data.size,
    message: parsed.data.message,
    event_date: parsed.data.eventDate,
    budget_min: parsed.data.budgetMin,
    budget_max: parsed.data.budgetMax,
    reference_image_name: parsed.data.referenceImageName ?? null,
  });

  if (cakeError) {
    return NextResponse.json({ message: cakeError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orderId, cakeRequestId });
}
