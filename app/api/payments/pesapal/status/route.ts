import { NextResponse } from "next/server";
import { getOrderPaymentSnapshot } from "@/lib/payments/order-payments";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId")?.trim();
  const hint = searchParams.get("hint") === "cancelled" ? "cancelled" : undefined;
  const refresh = searchParams.get("refresh") !== "0";

  if (!orderId) {
    return NextResponse.json({ message: "Missing orderId." }, { status: 400 });
  }

  try {
    const snapshot = await getOrderPaymentSnapshot(orderId, {
      refresh,
      hint,
    });
    return NextResponse.json({ ok: true, order: snapshot });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to fetch payment status." },
      { status: 500 },
    );
  }
}
