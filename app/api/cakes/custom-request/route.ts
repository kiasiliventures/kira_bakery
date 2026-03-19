import { NextResponse } from "next/server";
import { cakeRequestSchema } from "@/lib/cakes";
import { createCakeCustomRequest, getCakePrices } from "@/lib/cakes-data";
import { enforceRateLimit } from "@/lib/rate-limit";

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request: Request) {
  try {
    const rateLimit = await enforceRateLimit(request, "cake-custom-request", 10, 15 * 60_000);
    if (!rateLimit.allowed) {
      return tooManyRequests(rateLimit.retryAfterSeconds);
    }

    const body = await request.json();
    const parsed = cakeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid cake request payload.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const prices = await getCakePrices();
    const selectedPrice = prices.find((price) => price.id === parsed.data.priceId);

    if (!selectedPrice) {
      return NextResponse.json(
        { message: "The selected cake combination is no longer available." },
        { status: 400 },
      );
    }

    if (
      selectedPrice.flavourId !== parsed.data.flavourId
      || selectedPrice.shapeId !== parsed.data.shapeId
      || selectedPrice.sizeId !== parsed.data.sizeId
      || selectedPrice.tierOptionId !== parsed.data.tierOptionId
      || selectedPrice.toppingId !== parsed.data.toppingId
    ) {
      return NextResponse.json(
        { message: "Cake selection does not match the current pricing matrix." },
        { status: 400 },
      );
    }

    const created = await createCakeCustomRequest({
      customerName: parsed.data.customerName,
      phone: parsed.data.phone,
      email: parsed.data.email || undefined,
      notes: parsed.data.notes || undefined,
      eventDate: parsed.data.eventDate,
      messageOnCake: parsed.data.messageOnCake || undefined,
      price: selectedPrice,
    });

    return NextResponse.json(
      {
        ok: true,
        requestId: created.id,
        status: created.status,
        createdAt: created.created_at,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("cake_custom_request_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ message: "Unable to submit your cake request." }, { status: 500 });
  }
}
