import { NextResponse } from "next/server";
import { initiatePesapalPaymentForOrder } from "@/lib/payments/order-payments";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
  const orderId = body?.orderId?.trim();

  if (!orderId) {
    return NextResponse.json({ message: "Missing orderId." }, { status: 400 });
  }

  try {
    const payment = await initiatePesapalPaymentForOrder(orderId);
    return NextResponse.json({
      ok: true,
      id: payment.orderId,
      redirectUrl: payment.redirectUrl,
      orderTrackingId: payment.orderTrackingId,
      paymentStatus: payment.paymentStatus,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to initiate payment." },
      { status: 500 },
    );
  }
}
