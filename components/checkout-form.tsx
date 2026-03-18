"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DeliveryLocationSearch } from "@/components/delivery-location-search";
import { useCart } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceKm, formatUGX } from "@/lib/format";
import type { DeliveryQuote, DeliveryResolvedLocation } from "@/lib/delivery/types";
import { checkoutSchema, type CheckoutSchemaInput } from "@/lib/validation";

type CheckoutFormProps = {
  compact?: boolean;
};

export function CheckoutForm({ compact = false }: CheckoutFormProps) {
  const router = useRouter();
  const { items, subtotalUGX } = useCart();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState<DeliveryResolvedLocation | null>(null);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [isDeliveryQuotePending, setIsDeliveryQuotePending] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup">(
    "delivery",
  );
  const idempotencyKeyRef = useRef<string | null>(null);
  const deliveryFeeUGX = deliveryMethod === "delivery" ? deliveryQuote?.deliveryFee ?? 0 : 0;
  const totalUGX = subtotalUGX + deliveryFeeUGX;
  const requiresDeliveryQuote = deliveryMethod === "delivery";
  const hasValidDeliveryQuote = Boolean(
    deliveryLocation && deliveryQuote && !isDeliveryQuotePending,
  );

  useEffect(() => {
    if (deliveryMethod !== "pickup") {
      return;
    }

    setDeliveryLocation(null);
    setDeliveryQuote(null);
    setIsDeliveryQuotePending(false);
    setErrors((previous) => {
      const nextErrors = { ...previous };
      delete nextErrors.address;
      delete nextErrors.deliveryDate;
      return nextErrors;
    });
  }, [deliveryMethod]);

  function clearFieldError(field: string) {
    setErrors((previous) => {
      if (!previous[field]) {
        return previous;
      }

      const nextErrors = { ...previous };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  const onSubmit = async (formData: FormData) => {
    if (requiresDeliveryQuote && !hasValidDeliveryQuote) {
      setErrors((previous) => ({
        ...previous,
        address: "Select a verified delivery location and wait for the delivery quote.",
      }));
      return;
    }

    const raw: CheckoutSchemaInput = {
      deliveryMethod: String(formData.get("deliveryMethod") ?? "delivery") as
        | "delivery"
        | "pickup",
      customerName: String(formData.get("customerName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      address: deliveryMethod === "delivery" ? deliveryLocation?.addressText ?? "" : "",
      deliveryDate: String(formData.get("deliveryDate") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      deliveryLocation:
        deliveryMethod === "delivery"
          ? {
              placeId: deliveryLocation?.placeId ?? "",
              addressText: deliveryLocation?.addressText ?? "",
              latitude: deliveryLocation?.latitude,
              longitude: deliveryLocation?.longitude,
            }
          : undefined,
    };

    const result = checkoutSchema.safeParse(raw);
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        nextErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          customer: result.data,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            selectedSize: item.selectedSize,
            selectedFlavor: item.selectedFlavor,
          })),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            message?: string;
            id?: string;
            redirectUrl?: string;
          }
        | null;

      if (!response.ok) {
        setErrors({ form: payload?.message ?? "Unable to place order. Please try again." });
        return;
      }

      idempotencyKeyRef.current = null;
      if (payload?.redirectUrl) {
        window.location.assign(payload.redirectUrl);
        return;
      }

      if (payload?.id) {
        router.push(`/payment/result?orderId=${encodeURIComponent(payload.id)}`);
        return;
      }

      setErrors({ form: "Payment link missing. Please try again." });
    } catch {
      setErrors({ form: "Network issue while placing order. Retry once and we will avoid duplicates." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form action={onSubmit} className="space-y-4">
      <div className={compact ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
        <div className="space-y-2">
          <Label htmlFor="customerName">Name</Label>
          <Input
            id="customerName"
            name="customerName"
            placeholder="Your name"
            onChange={() => clearFieldError("customerName")}
          />
          {errors.customerName && <p className="text-xs text-danger">{errors.customerName}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" placeholder="+256..." onChange={() => clearFieldError("phone")} />
          {errors.phone && <p className="text-xs text-danger">{errors.phone}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            onChange={() => clearFieldError("email")}
          />
          {errors.email && <p className="text-xs text-danger">{errors.email}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="deliveryMethod">Delivery Option</Label>
          <Select
            id="deliveryMethod"
            name="deliveryMethod"
            value={deliveryMethod}
            onChange={(event) => setDeliveryMethod(event.target.value as "delivery" | "pickup")}
          >
            <option value="delivery">Deliver to me</option>
            <option value="pickup">I will pick it up</option>
          </Select>
        </div>
      </div>

      {deliveryMethod === "delivery" && (
        <DeliveryLocationSearch
          validationMessage={errors.address}
          onLocationResolved={(location) => {
            setDeliveryLocation(location);
            clearFieldError("address");
          }}
          onQuoteResolved={(quote) => {
            setDeliveryQuote(quote);
            if (quote) {
              clearFieldError("address");
            }
          }}
          onQuotePendingChange={setIsDeliveryQuotePending}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="deliveryDate">
          {deliveryMethod === "delivery" ? "Delivery Date" : "Pickup Date (optional)"}
        </Label>
        <Input
          id="deliveryDate"
          name="deliveryDate"
          type="date"
          onChange={() => clearFieldError("deliveryDate")}
        />
        {errors.deliveryDate && <p className="text-xs text-danger">{errors.deliveryDate}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" placeholder="Any special instructions?" />
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-surface-alt p-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted">Subtotal</span>
          <span className="font-medium text-foreground">{formatUGX(subtotalUGX)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted">Delivery</span>
          <span className="font-medium text-foreground">
            {deliveryMethod === "pickup"
              ? "Pickup"
              : deliveryQuote
                ? formatUGX(deliveryQuote.deliveryFee)
                : isDeliveryQuotePending
                  ? "Quoting..."
                  : "Select location"}
          </span>
        </div>
        {deliveryMethod === "delivery" && deliveryQuote && (
          <div className="flex items-center justify-between gap-4 text-xs text-muted">
            <span>Estimated route distance</span>
            <span>{formatDistanceKm(deliveryQuote.distanceKm)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
          <span className="font-semibold text-foreground">Total</span>
          <span className="text-base font-semibold text-foreground">{formatUGX(totalUGX)}</span>
        </div>
      </div>

      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {deliveryMethod === "pickup"
            ? "Pickup keeps your total at the cart subtotal."
            : hasValidDeliveryQuote
              ? "Delivery fee has been verified and will be recalculated on the server."
              : "Choose a verified location before placing a delivery order."}
        </p>
        <Button disabled={items.length === 0 || isSubmitting || (requiresDeliveryQuote && !hasValidDeliveryQuote)}>
          {isSubmitting ? "Redirecting..." : "Pay with Pesapal"}
        </Button>
      </div>
      <p className="text-xs text-muted">
        Mobile money charges may apply and will be shown at checkout.
      </p>
    </form>
  );
}
