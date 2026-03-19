import { NextResponse } from "next/server";
import { getCakeBuilderData } from "@/lib/cakes-data";

export async function GET() {
  try {
    const { config, prices } = await getCakeBuilderData();
    return NextResponse.json({ config, prices });
  } catch (error) {
    console.error("cake_builder_data_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ message: "Unable to load cake builder." }, { status: 500 });
  }
}
