import { NextResponse } from "next/server";
import { isDeliveryError } from "@/lib/delivery/errors";
import { autocompleteDeliveryPlaces } from "@/lib/delivery/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { deliveryAutocompleteRequestSchema } from "@/lib/validation";

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function GET(request: Request) {
  const rateLimit = enforceRateLimit(request, "delivery-autocomplete", 30, 60_000);
  if (!rateLimit.allowed) {
    return tooManyRequests(rateLimit.retryAfterSeconds);
  }

  const { searchParams } = new URL(request.url);
  const parsed = deliveryAutocompleteRequestSchema.safeParse({
    input: searchParams.get("input") ?? "",
    sessionToken: searchParams.get("sessionToken") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid autocomplete request." },
      { status: 400 },
    );
  }

  try {
    const suggestions = await autocompleteDeliveryPlaces(parsed.data.input, {
      sessionToken: parsed.data.sessionToken || undefined,
      limit: 5,
    });

    return NextResponse.json({ ok: true, suggestions });
  } catch (error) {
    if (isDeliveryError(error)) {
      return NextResponse.json(
        { message: error.publicMessage, code: error.code, suggestions: [] },
        { status: error.status },
      );
    }

    console.error("delivery_autocomplete_failed", error);
    return NextResponse.json(
      { message: "Unable to search delivery locations right now.", suggestions: [] },
      { status: 500 },
    );
  }
}
