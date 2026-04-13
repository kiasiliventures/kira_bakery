"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STOREFRONT_EVENT_NAMES, captureStorefrontEvent } from "@/lib/analytics/posthog";
import { formatUGX } from "@/lib/format";
import { buildOrderPath } from "@/lib/orders/order-link";

type PaymentResultOrder = {
  orderId: string;
  customerName: string;
  orderStatus: string;
  totalUGX: number;
  paymentStatus: string;
  viewState: "success" | "failed" | "cancelled" | "pending";
  verified: boolean;
  items: Array<{
    name: string;
    quantity: number;
    selectedSize: string | null;
    selectedFlavor: string | null;
  }>;
};

type PaymentStatusResponse = {
  ok?: boolean;
  order?: PaymentResultOrder;
  message?: string;
};

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 5;
function getTitle(viewState: PaymentResultOrder["viewState"] | null) {
  if (viewState === "success") return "Payment confirmed";
  if (viewState === "failed") return "Payment failed";
  if (viewState === "cancelled") return "Payment cancelled";
  return "Payment pending";
}

function getMessage(order: PaymentResultOrder | null) {
  if (!order) {
    return "We could not load your payment result.";
  }

  if (order.viewState === "success") {
    return `Hi ${order.customerName}, we've confirmed your payment and your order is now moving ahead.`;
  }
  if (order.viewState === "failed") {
    return "Pesapal reported the transaction as failed. Your stock remains untouched.";
  }
  if (order.viewState === "cancelled") {
    return "The payment was cancelled or abandoned. Your order remains unpaid and stock is untouched.";
  }
  return "We have not verified a successful payment yet. You can refresh this page in a moment.";
}

export function PaymentResultView() {
  const searchParams = useSearchParams();
  const { clearCart } = useCart();
  const [payload, setPayload] = useState<PaymentStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestSequence, setRequestSequence] = useState(0);
  const [pollAttempts, setPollAttempts] = useState(0);
  const hasClearedCartRef = useRef(false);
  const hasCapturedCompletedOrderRef = useRef(false);

  const orderId = searchParams.get("orderId");
  const orderAccessLinkToken = searchParams.get("access");
  const hint = searchParams.get("hint") === "cancelled" || searchParams.get("cancelled") === "1"
    ? "cancelled"
    : null;

  const statusUrl = useMemo(() => {
    if (!orderId) {
      return null;
    }
    const params = new URLSearchParams({
      orderId,
      refresh: "1",
    });
    if (orderAccessLinkToken) {
      params.set("access", orderAccessLinkToken);
    }
    if (hint) {
      params.set("hint", hint);
    }
    return `/api/payments/pesapal/status?${params.toString()}`;
  }, [hint, orderAccessLinkToken, orderId]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      if (!statusUrl) {
        setError("Missing secure order reference.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(statusUrl, { cache: "no-store" });
        const nextPayload = (await response.json().catch(() => null)) as PaymentStatusResponse | null;

        if (!response.ok) {
          throw new Error(nextPayload?.message ?? "Unable to fetch payment status.");
        }

        if (!cancelled) {
          setPayload(nextPayload);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Unable to fetch payment status.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [requestSequence, statusUrl]);

  const order = payload?.order ?? null;
  const title = getTitle(order?.viewState ?? null);
  const message = getMessage(order);
  const viewOrderUrl = order
    ? buildOrderPath(order.orderId, orderAccessLinkToken)
    : null;

  useEffect(() => {
    if (order?.viewState !== "success" || hasClearedCartRef.current) {
      return;
    }

    clearCart();
    hasClearedCartRef.current = true;
  }, [clearCart, order?.viewState]);

  useEffect(() => {
    if (order?.viewState !== "success" || hasCapturedCompletedOrderRef.current) {
      return;
    }

    captureStorefrontEvent(STOREFRONT_EVENT_NAMES.orderCompleted, {
      order_id: order.orderId,
      total_ugx: order.totalUGX,
      item_count: order.items.reduce((sum, item) => sum + item.quantity, 0),
      distinct_item_count: order.items.length,
      payment_status: order.paymentStatus,
      verified: order.verified,
    });
    hasCapturedCompletedOrderRef.current = true;
  }, [order]);

  useEffect(() => {
    if (
      !orderId
      || isLoading
      || error
      || order?.viewState !== "pending"
      || pollAttempts >= MAX_POLL_ATTEMPTS
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPollAttempts((current) => current + 1);
      setRequestSequence((current) => current + 1);
    }, POLL_INTERVAL_MS);

    return () => window.clearTimeout(timeout);
  }, [error, isLoading, order?.viewState, orderId, pollAttempts]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col justify-center px-6 py-16">
      <div className="space-y-6">
        <Card className="rounded-[28px] border-2 border-accent/35 bg-surface shadow-[var(--shadow-modal)]">
          <CardHeader className="gap-2 p-8 pb-5">
            <p className="text-sm uppercase tracking-[0.25em] text-badge-foreground">KiRA Bakery</p>
            <CardTitle className="mt-1 font-serif text-4xl text-foreground">{title}</CardTitle>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
              {isLoading ? "Verifying your payment with the backend..." : error ?? message}
            </p>
          </CardHeader>
          <CardContent className="space-y-6 p-8 pt-0">
            {order && !isLoading && !error && (
              <section className="rounded-2xl border border-accent/20 bg-surface-alt/45 p-6 text-sm text-foreground">
                <h2 className="font-serif text-2xl text-foreground">Payment summary</h2>
                <div className="mt-4 space-y-3">
                  <p>Order ID: {order.orderId}</p>
                  <p>Order total: {formatUGX(order.totalUGX)}</p>
                  <p>Payment status: {order.paymentStatus}</p>
                  <p>Order status: {order.orderStatus}</p>
                  <p>Verified with Pesapal: {order.verified ? "yes" : "no"}</p>
                </div>
              </section>
            )}

            <div className="flex flex-wrap gap-3">
              {viewOrderUrl && (
                <Button type="button" onClick={() => window.location.assign(viewOrderUrl)}>
                  View Order
                </Button>
              )}
              <Button
                type="button"
                onClick={() => {
                  setPollAttempts(0);
                  setRequestSequence((current) => current + 1);
                }}
                disabled={!orderId || isLoading}
                variant={viewOrderUrl ? "outline" : "default"}
              >
                Check Status
              </Button>
              <Button type="button" variant="outline" onClick={() => window.location.assign("/cart")}>
                Back to Cart
              </Button>
              <Button type="button" variant="ghost" onClick={() => window.location.assign("/menu")}>
                Browse Menu
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
