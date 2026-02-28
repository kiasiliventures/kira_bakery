import { NextResponse } from "next/server";
import { checkoutSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid checkout payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

