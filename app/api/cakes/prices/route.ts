import { NextResponse } from "next/server";
import { getCakePrices } from "@/lib/cakes-data";

export async function GET() {
  try {
    const prices = await getCakePrices();
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("cake_prices_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ message: "Unable to load cake prices." }, { status: 500 });
  }
}
