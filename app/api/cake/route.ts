import { NextResponse } from "next/server";

export async function POST(request: Request) {
  void request;

  return NextResponse.json(
    {
      message:
        "This legacy cake request endpoint is no longer supported. Use /api/cakes/custom-request instead.",
    },
    { status: 410 },
  );
}
