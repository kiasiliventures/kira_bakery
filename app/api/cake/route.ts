import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { generateId } from "@/lib/format";
import { cakeBuilderSchema } from "@/lib/validation";

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request: Request) {
  const rateLimit = await enforceRateLimit(request, "cake", 8, 60_000);
  if (!rateLimit.allowed) {
    return tooManyRequests(rateLimit.retryAfterSeconds);
  }

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
    fulfillment_method: "pickup",
    delivery_method: "pickup",
    delivery_fee: 0,
    customer_name: "Guest Cake Request",
    phone: "+256000000000",
    address: "Kira",
    delivery_date: parsed.data.eventDate,
  });

  if (orderError) {
    console.error("cake_order_insert_failed", orderError.message);
    return NextResponse.json({ message: "Unable to submit cake request." }, { status: 500 });
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
    console.error("cake_request_insert_failed", cakeError.message);
    return NextResponse.json({ message: "Unable to submit cake request." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orderId, cakeRequestId });
}
