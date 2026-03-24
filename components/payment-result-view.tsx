"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/providers/app-provider";
import { OrderReviewPrompt } from "@/components/order-review-prompt";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUGX } from "@/lib/format";

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
const REVIEWABLE_ORDER_STATUSES = new Set(["paid", "ready", "completed"]);
const BLOCKED_PAYMENT_STATUSES = new Set(["failed", "payment_failed", "cancelled", "canceled"]);

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

function shouldShowReviewPrompt(order: PaymentResultOrder | null) {
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

export function PaymentResultView() {
  const searchParams = useSearchParams();
  const { clearCart } = useCart();
  const [payload, setPayload] = useState<PaymentStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestSequence, setRequestSequence] = useState(0);
  const [pollAttempts, setPollAttempts] = useState(0);
  const hasClearedCartRef = useRef(false);

  const orderId = searchParams.get("orderId");
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
    if (hint) {
      params.set("hint", hint);
    }
    return `/api/payments/pesapal/status?${params.toString()}`;
  }, [hint, orderId]);

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
  const showReviewPrompt = !isLoading && !error && shouldShowReviewPrompt(order);

  useEffect(() => {
    if (order?.viewState !== "success" || hasClearedCartRef.current) {
      return;
    }

    clearCart();
    hasClearedCartRef.current = true;
  }, [clearCart, order?.viewState]);

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
      <div className="space-y-8">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-badge-foreground">KiRA Bakery</p>
          <h1 className="mt-3 font-serif text-4xl text-foreground">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            {isLoading ? "Verifying your payment with the backend..." : error ?? message}
          </p>
        </div>

        {order && !isLoading && !error && (
          <Card className="rounded-[28px] border-2 border-border/90 bg-surface-alt/35 shadow-[var(--shadow-modal)]">
            <CardHeader className="gap-2 p-7 pb-4">
              <CardTitle className="font-serif text-2xl">Order details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-7 pt-0 text-sm text-foreground">
              <p>Order ID: {order.orderId}</p>
              <p>Amount paid: {formatUGX(order.totalUGX)}</p>
              <p>Payment status: {order.paymentStatus}</p>
              <p>Order status: {order.orderStatus}</p>
              <p>Verified with Pesapal: {order.verified ? "yes" : "no"}</p>
              {order.items.length > 0 && (
                <div className="pt-3">
                  <p className="font-semibold text-foreground">Items ordered</p>
                  <ul className="mt-2 space-y-2">
                    {order.items.map((item, index) => (
                      <li key={`${item.name}-${index}`} className="rounded-xl bg-surface px-4 py-3">
                        <span className="font-medium">{item.quantity} x {item.name}</span>
                        {(item.selectedSize || item.selectedFlavor) && (
                          <span className="text-muted">
                            {" "}
                            {[
                              item.selectedSize ? `Size: ${item.selectedSize}` : null,
                              item.selectedFlavor ? `Flavor: ${item.selectedFlavor}` : null,
                            ]
                              .filter(Boolean)
                              .join(" | ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => {
              setPollAttempts(0);
              setRequestSequence((current) => current + 1);
            }}
            disabled={!orderId || isLoading}
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

        {showReviewPrompt && <OrderReviewPrompt />}
      </div>
    </main>
  );
}
