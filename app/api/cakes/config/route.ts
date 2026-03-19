import { NextResponse } from "next/server";
import { getCakeBuilderData } from "@/lib/cakes-data";

export async function GET() {
  try {
    const { config } = await getCakeBuilderData();
    return NextResponse.json({ config });
  } catch (error) {
    console.error("cake_config_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ message: "Unable to load cake options." }, { status: 500 });
  }
}
