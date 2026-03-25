import { NextResponse } from "next/server";
import { ensureCustomerForUser } from "@/lib/customers";
import { getCustomerOrders } from "@/lib/orders/customer-orders";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ message: "You must be signed in to view your orders." }, { status: 401 });
  }

  await ensureCustomerForUser(user);
  const orders = await getCustomerOrders(user.id);

  return NextResponse.json({
    ok: true,
    orders,
  });
}
