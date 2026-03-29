"use client";

import { useEffect, useMemo, useState } from "react";
import { EnableOrderNotifications } from "@/components/enable-order-notifications";
import { OrderReviewPrompt } from "@/components/order-review-prompt";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUGX } from "@/lib/format";

type OrderStatusViewProps = {
  orderId: string;
  orderAccessLinkToken?: string | null;
};

type OrderDetail = {
  orderId: string;
  customerName: string;
  orderStatus: string;
  totalUGX: number;
  subtotalUGX: number;
  deliveryFeeUGX: number;
  paymentStatus: string;
  paymentStatusLabel: string;
  viewState: "success" | "failed" | "cancelled" | "pending";
  verified: boolean;
  fulfillmentMethod: "delivery" | "pickup";
  deliveryAddress: string | null;
  deliveryDate: string | null;
  notes: string | null;
  createdAt: string;
  items: Array<{
    name: string;
    priceUGX: number;
    quantity: number;
    selectedSize: string | null;
    selectedFlavor: string | null;
  }>;
};

type OrderDetailResponse = {
  ok?: boolean;
  order?: OrderDetail;
  message?: string;
};

const REVIEWABLE_ORDER_STATUSES = new Set(["paid", "ready", "completed"]);
const BLOCKED_PAYMENT_STATUSES = new Set(["failed", "payment_failed", "cancelled", "canceled"]);

function shouldShowReviewPrompt(order: OrderDetail | null) {
  if (!order) {
    return false;
  }

  const normalizedPaymentStatus = order.paymentStatus.trim().toLowerCase();
  const normalizedOrderStatus = order.orderStatus.trim().toLowerCase();

  if (BLOCKED_PAYMENT_STATUSES.has(normalizedPaymentStatus)) {
    return false;
  }

  return REVIEWABLE_ORDER_STATUSES.has(normalizedOrderStatus);
}

function formatOrderDate(value: string | null) {
  if (!value) {
    return "Not provided";
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

function formatCreatedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function OrderStatusView({
  orderId,
  orderAccessLinkToken,
}: OrderStatusViewProps) {
  const [payload, setPayload] = useState<OrderDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestSequence, setRequestSequence] = useState(0);

  const statusUrl = useMemo(() => {
    const params = new URLSearchParams({
      refresh: "1",
    });

    if (orderAccessLinkToken) {
      params.set("access", orderAccessLinkToken);
    }

    return `/api/orders/${encodeURIComponent(orderId)}?${params.toString()}`;
  }, [orderAccessLinkToken, orderId]);

  useEffect(() => {
    let cancelled = false;

    async function loadOrder() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(statusUrl, { cache: "no-store" });
        const nextPayload = (await response.json().catch(() => null)) as OrderDetailResponse | null;

        if (!response.ok) {
          throw new Error(nextPayload?.message ?? "Unable to fetch order details.");
        }

        if (!cancelled) {
          setPayload(nextPayload);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Unable to fetch order details.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadOrder();

    return () => {
      cancelled = true;
    };
  }, [requestSequence, statusUrl]);

  const order = payload?.order ?? null;
  const showNotificationOptIn = !isLoading && !error && order?.paymentStatus === "paid";
  const showReview = !isLoading && !error && shouldShowReviewPrompt(order);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-5xl flex-col justify-center px-6 py-16">
      <div className="space-y-6">
        <Card className="rounded-[28px] border-2 border-accent/25 bg-surface shadow-[var(--shadow-modal)]">
          <CardHeader className="gap-2 p-8 pb-5">
            <p className="text-sm uppercase tracking-[0.25em] text-badge-foreground">KiRA Bakery</p>
            <CardTitle className="mt-1 font-serif text-4xl text-foreground">Order Status</CardTitle>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
              {isLoading
                ? "Loading your order details..."
                : error
                  ? error
                  : `Order ${order?.orderId} for ${order?.customerName}.`}
            </p>
          </CardHeader>
          <CardContent className="space-y-6 p-8 pt-0">
            {order && !isLoading && !error && (
              <div className="grid gap-4 lg:grid-cols-[1.25fr_0.85fr]">
                <section className="space-y-4 rounded-2xl border border-accent/20 bg-surface-alt/45 p-6">
                  <div className="space-y-2">
                    <h2 className="font-serif text-2xl text-foreground">Order details</h2>
                    <div className="grid gap-2 text-sm text-foreground sm:grid-cols-2">
                      <p>Order ID: {order.orderId}</p>
                      <p>Placed: {formatCreatedAt(order.createdAt)}</p>
                      <p>Payment status: {order.paymentStatusLabel}</p>
                      <p>Order status: {order.orderStatus}</p>
                      <p>Fulfillment: {order.fulfillmentMethod === "delivery" ? "Delivery" : "Pickup"}</p>
                      <p>Verified with payment provider: {order.verified ? "yes" : "no"}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="font-semibold text-foreground">Items</p>
                    {order.items.map((item, index) => (
                      <div
                        key={`${item.name}-${index}`}
                        className="rounded-2xl border border-border bg-surface px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">
                              {item.quantity} x {item.name}
                            </p>
                            {(item.selectedSize || item.selectedFlavor) && (
                              <p className="text-sm text-muted">
                                {[
                                  item.selectedSize ? `Size: ${item.selectedSize}` : null,
                                  item.selectedFlavor ? `Flavor: ${item.selectedFlavor}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" | ")}
                              </p>
                            )}
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            {formatUGX(item.priceUGX * item.quantity)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="rounded-2xl border border-accent/20 bg-surface-alt/45 p-6">
                    <h2 className="font-serif text-2xl text-foreground">Totals</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted">Subtotal</span>
                        <span className="font-medium text-foreground">{formatUGX(order.subtotalUGX)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted">
                          {order.fulfillmentMethod === "delivery" ? "Delivery" : "Pickup"}
                        </span>
                        <span className="font-medium text-foreground">
                          {order.fulfillmentMethod === "delivery"
                            ? formatUGX(order.deliveryFeeUGX)
                            : "No fee"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                        <span className="font-semibold text-foreground">Total</span>
                        <span className="font-semibold text-foreground">{formatUGX(order.totalUGX)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-accent/20 bg-surface-alt/45 p-6">
                    <h2 className="font-serif text-2xl text-foreground">
                      {order.fulfillmentMethod === "delivery" ? "Delivery details" : "Pickup details"}
                    </h2>
                    <div className="mt-4 space-y-3 text-sm text-foreground">
                      <p>
                        {order.fulfillmentMethod === "delivery" ? "Address" : "Collection"}:{" "}
                        {order.fulfillmentMethod === "delivery"
                          ? order.deliveryAddress ?? "Not provided"
                          : "KiRA Bakery"}
                      </p>
                      <p>
                        {order.fulfillmentMethod === "delivery" ? "Requested delivery date" : "Requested pickup date"}:{" "}
                        {formatOrderDate(order.deliveryDate)}
                      </p>
                      {order.notes && <p>Notes: {order.notes}</p>}
                    </div>
                  </div>
                </section>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => setRequestSequence((current) => current + 1)}
                disabled={isLoading}
              >
                Refresh Order
              </Button>
              <Button type="button" variant="outline" onClick={() => window.location.assign("/menu")}>
                Browse Menu
              </Button>
              <Button type="button" variant="ghost" onClick={() => window.location.assign("/account/orders")}>
                My Orders
              </Button>
            </div>
          </CardContent>
        </Card>

        {showNotificationOptIn && order && <EnableOrderNotifications orderId={order.orderId} />}
        {showReview && <OrderReviewPrompt />}
      </div>
    </main>
  );
}
