import { NextResponse } from "next/server";
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

  return NextResponse.json({ ok: true });
}

