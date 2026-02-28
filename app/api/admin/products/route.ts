import { NextResponse } from "next/server";
import { adminProductSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = adminProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid admin product payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

