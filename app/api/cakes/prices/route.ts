import { NextResponse } from "next/server";
import { getCakeBuilderData } from "@/lib/cakes-data";

export async function GET() {
  try {
    const { prices } = await getCakeBuilderData();
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("cake_prices_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ message: "Unable to load cake prices." }, { status: 500 });
  }
}
