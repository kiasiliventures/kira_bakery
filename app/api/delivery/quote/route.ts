import { NextResponse } from "next/server";
import { isDeliveryError } from "@/lib/delivery/errors";
import { quoteDelivery } from "@/lib/delivery/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { deliveryQuoteRequestSchema } from "@/lib/validation";

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request: Request) {
  const rateLimit = enforceRateLimit(request, "delivery-quote", 20, 60_000);
  if (!rateLimit.allowed) {
    return tooManyRequests(rateLimit.retryAfterSeconds);
  }

  const body = await request.json().catch(() => null);
  const parsed = deliveryQuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid delivery quote payload." },
      { status: 400 },
    );
  }

  try {
    const quote = await quoteDelivery(parsed.data);
    return NextResponse.json({ ok: true, quote });
  } catch (error) {
    if (isDeliveryError(error)) {
      return NextResponse.json(
        { message: error.publicMessage, code: error.code },
        { status: error.status },
      );
    }

    console.error("delivery_quote_failed", error);
    return NextResponse.json(
      { message: "Unable to calculate delivery pricing right now." },
      { status: 500 },
    );
  }
}
