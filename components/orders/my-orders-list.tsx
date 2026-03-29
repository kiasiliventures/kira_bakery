"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUGX } from "@/lib/format";
import { buildOrderPath } from "@/lib/orders/order-link";
import type { CustomerOrderSummary } from "@/lib/orders/customer-orders";
import type { CanonicalOrderStatus } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

type OrdersResponse = {
  ok?: boolean;
  orders?: CustomerOrderSummary[];
  message?: string;
};

const statusStyles: Record<CanonicalOrderStatus, string> = {
  "Pending Payment": "bg-amber-100 text-amber-700",
  Paid: "bg-sky-100 text-sky-700",
  Ready: "bg-emerald-100 text-emerald-700",
  Completed: "bg-slate-200 text-slate-700",
  "Payment Failed": "bg-rose-100 text-rose-700",
  Cancelled: "bg-rose-100 text-rose-700",
};

export function MyOrdersList() {
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/account/orders", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as OrdersResponse | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "Unable to load your orders.");
      }

      setOrders(payload.orders ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load your orders.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  if (isLoading) {
    return <p className="text-sm text-muted">Loading your orders...</p>;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-danger">{error}</p>
        <Button type="button" variant="outline" onClick={() => void loadOrders()}>
          Try again
        </Button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="rounded-[28px] border-2 border-border bg-surface shadow-[var(--shadow-soft)]">
        <CardHeader className="p-8 pb-4">
          <CardTitle className="font-serif text-3xl text-foreground">My Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-8 pt-0 text-sm leading-7 text-muted">
          Your account is ready. New signed-in orders will appear here after checkout.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card
          key={order.id}
          className="rounded-[28px] border-2 border-border bg-surface shadow-[var(--shadow-soft)]"
        >
          <CardHeader className="gap-3 p-8 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-badge-foreground">Order</p>
                <CardTitle className="mt-2 font-serif text-3xl text-foreground">
                  {order.id}
                </CardTitle>
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[order.status]}`}
              >
                {order.status}
              </span>
            </div>
            <p className="text-sm text-muted">
              {new Date(order.createdAt).toLocaleString()} |{" "}
              {order.deliveryMethod === "delivery" ? "Delivery" : "Pickup"} |{" "}
              {order.paymentStatusLabel}
            </p>
          </CardHeader>
          <CardContent className="space-y-5 p-8 pt-0">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-alt px-4 py-3">
              <span className="text-sm text-muted">Total</span>
              <span className="text-base font-semibold text-foreground">{formatUGX(order.totalUGX)}</span>
            </div>

            <div className="space-y-3">
              {order.items.map((item, index) => (
                <div
                  key={`${order.id}-${item.name}-${index}`}
                  className="rounded-2xl border border-border bg-surface-alt px-4 py-3"
                >
                  <p className="font-medium text-foreground">
                    {item.quantity} x {item.name}
                  </p>
                  <p className="mt-1 text-sm text-muted">{formatUGX(item.priceUGX)}</p>
                  {(item.selectedSize || item.selectedFlavor) ? (
                    <p className="mt-1 text-sm text-muted">
                      {[item.selectedSize, item.selectedFlavor].filter(Boolean).join(" | ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <Link
              href={buildOrderPath(order.id)}
              className={cn(buttonVariants({ variant: "outline", size: "sm", className: "w-full sm:w-auto" }))}
            >
              View Order
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
