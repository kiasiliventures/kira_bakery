"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";

type PaymentResultOrder = {
  orderId: string;
  paymentStatus: string;
  orderTrackingId: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  viewState: "success" | "failed" | "cancelled" | "pending";
  verified: boolean;
  providerStatus: string | null;
};

type PaymentStatusResponse = {
  ok?: boolean;
  order?: PaymentResultOrder;
  message?: string;
};

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
    return "Your payment was verified by the backend. We have kept the order active and it can proceed.";
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
        setError("Missing order reference.");
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
          if (nextPayload?.order?.viewState === "success") {
            clearCart();
          }
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
  }, [clearCart, statusUrl]);

  const order = payload?.order ?? null;
  const title = getTitle(order?.viewState ?? null);
  const message = getMessage(order);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col justify-center px-6 py-16">
      <div className="rounded-[28px] border border-[#c9af93]/55 bg-[#fff8f0] p-8 shadow-[0_18px_45px_rgba(64,38,18,0.10)]">
        <p className="text-sm uppercase tracking-[0.25em] text-[#8a5d38]">Pesapal Sandbox</p>
        <h1 className="mt-3 font-serif text-4xl text-[#2D1F16]">{title}</h1>
        <p className="mt-4 text-base leading-7 text-[#5b4431]">
          {isLoading ? "Verifying your payment with the backend..." : error ?? message}
        </p>

        {order && !isLoading && !error && (
          <div className="mt-6 space-y-2 rounded-2xl bg-white/80 p-5 text-sm text-[#3d2b1f]">
            <p>Order ID: {order.orderId}</p>
            <p>Payment status: {order.paymentStatus}</p>
            <p>Verified with Pesapal: {order.verified ? "yes" : "no"}</p>
            {order.providerStatus && <p>Pesapal status: {order.providerStatus}</p>}
            {order.orderTrackingId && <p>Tracking ID: {order.orderTrackingId}</p>}
            {order.paymentReference && <p>Reference: {order.paymentReference}</p>}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" onClick={() => window.location.reload()} disabled={!orderId || isLoading}>
            Refresh Status
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.assign("/cart")}>
            Back to Cart
          </Button>
          <Button type="button" variant="ghost" onClick={() => window.location.assign("/menu")}>
            Browse Menu
          </Button>
        </div>
      </div>
    </main>
  );
}
