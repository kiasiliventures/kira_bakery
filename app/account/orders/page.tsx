import { redirect } from "next/navigation";
import { MyOrdersList } from "@/components/orders/my-orders-list";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function AccountOrdersPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/account/sign-in?next=/account/orders");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.22em] text-badge-foreground">Account</p>
        <h1 className="font-serif text-5xl text-foreground">My Orders</h1>
        <p className="max-w-2xl text-sm leading-7 text-muted">
          Track the current status of every signed-in order placed with your account.
        </p>
      </div>
      <MyOrdersList />
    </div>
  );
}
