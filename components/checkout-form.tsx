"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { DeliveryLocationSearch } from "@/components/delivery-location-search";
import { useCart } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STORAGE_KEYS } from "@/lib/constants";
import { formatDistanceKm, formatUGX } from "@/lib/format";
import {
  STOREFRONT_EVENT_NAMES,
  buildStaleCartEventProperties,
  captureStorefrontEvent,
} from "@/lib/analytics/posthog";
import type { DeliveryQuote, DeliveryResolvedLocation } from "@/lib/delivery/types";
import {
  clampCheckoutDateToSelectableMinimum,
  checkoutSchema,
  getCheckoutMinimumSelectableDateValue,
  type CheckoutSchemaInput,
} from "@/lib/validation";
import type { CartItem, StaleCartAdjustment, StaleCartPayload } from "@/types/order";

type CheckoutFormProps = {
  compact?: boolean;
};

type CheckoutSubmitState =
  | "idle"
  | "placing_order"
  | "preparing_payment"
  | "redirecting"
  | "error";

type StaleCartNotice = {
  message: string;
  adjustments: StaleCartAdjustment[];
};

function isStaleCartPayload(payload: unknown): payload is StaleCartPayload {
  return Boolean(
    payload
    && typeof payload === "object"
    && "code" in payload
    && payload.code === "STALE_CART"
    && "cart" in payload,
  );
}

const MIN_PLACING_ORDER_STATE_MS = 250;
const MIN_PREPARING_PAYMENT_STATE_MS = 250;
const REDIRECTING_PAINT_DELAY_MS = 120;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

async function waitForMinimumStateDuration(startedAt: number, minimumMs: number) {
  const elapsed = performance.now() - startedAt;
  if (elapsed < minimumMs) {
    await wait(minimumMs - elapsed);
  }
}

function getOrCreateCheckoutSessionToken() {
  if (typeof window === "undefined") {
    return "";
  }

  const existingToken = window.localStorage.getItem(STORAGE_KEYS.checkoutSession)?.trim();
  if (existingToken && existingToken.length >= 20) {
    return existingToken;
  }

  const nextToken = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEYS.checkoutSession, nextToken);
  return nextToken;
}

export function CheckoutForm({ compact = false }: CheckoutFormProps) {
  const router = useRouter();
  const { items, subtotalUGX, replaceItems } = useCart();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<CheckoutSubmitState>("idle");
  const [deliveryLocation, setDeliveryLocation] = useState<DeliveryResolvedLocation | null>(null);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [isDeliveryQuotePending, setIsDeliveryQuotePending] = useState(false);
  const [staleCartNotice, setStaleCartNotice] = useState<StaleCartNotice | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup">(
    "delivery",
  );
  const [deliveryDateValue, setDeliveryDateValue] = useState(() =>
    getCheckoutMinimumSelectableDateValue("delivery"),
  );
  const idempotencyKeyRef = useRef<string | null>(null);
  const submitStateRef = useRef<CheckoutSubmitState>("idle");
  const pickupResetTimeoutRef = useRef<number | null>(null);
  const deliveryFeeUGX = deliveryMethod === "delivery" ? deliveryQuote?.deliveryFee ?? 0 : 0;
  const totalUGX = subtotalUGX + deliveryFeeUGX;
  const requiresDeliveryQuote = deliveryMethod === "delivery";
  const hasValidDeliveryQuote = Boolean(
    deliveryLocation && deliveryQuote && !isDeliveryQuotePending,
  );
  const minimumSelectableDate = getCheckoutMinimumSelectableDateValue(deliveryMethod);

  function updateSubmitState(nextState: CheckoutSubmitState) {
    submitStateRef.current = nextState;
    setSubmitState(nextState);
  }

  function resetSubmitStateAfterError() {
    window.setTimeout(() => {
      if (submitStateRef.current === "error") {
        updateSubmitState("idle");
      }
    }, 0);
  }

  useEffect(() => {
    if (pickupResetTimeoutRef.current !== null) {
      window.clearTimeout(pickupResetTimeoutRef.current);
      pickupResetTimeoutRef.current = null;
    }

    if (deliveryMethod !== "pickup") {
      return;
    }

    pickupResetTimeoutRef.current = window.setTimeout(() => {
      setDeliveryLocation(null);
      setDeliveryQuote(null);
      setIsDeliveryQuotePending(false);
      setErrors((previous) => {
        const nextErrors = { ...previous };
        delete nextErrors.address;
        delete nextErrors.deliveryDate;
        return nextErrors;
      });
      pickupResetTimeoutRef.current = null;
    }, 0);

    return () => {
      if (pickupResetTimeoutRef.current !== null) {
        window.clearTimeout(pickupResetTimeoutRef.current);
        pickupResetTimeoutRef.current = null;
      }
    };
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

  function handleDeliveryMethodChange(nextMethod: "delivery" | "pickup") {
    setDeliveryMethod(nextMethod);
    setDeliveryDateValue((currentValue) =>
      clampCheckoutDateToSelectableMinimum(currentValue, nextMethod),
    );
  }

  function formatAdjustmentMessage(adjustment: StaleCartAdjustment) {
    const itemLabel = adjustment.currentSelectedSize ?? adjustment.selectedSize
      ? `${adjustment.name} (${adjustment.currentSelectedSize ?? adjustment.selectedSize})`
      : adjustment.name;

    if (adjustment.type === "price_changed") {
      return `${itemLabel}: price changed from ${formatUGX(adjustment.previousPriceUGX ?? 0)} to ${formatUGX(adjustment.currentPriceUGX ?? 0)}.`;
    }

    if (adjustment.type === "item_unavailable") {
      return `${itemLabel}: removed because it is no longer available.`;
    }

    if (adjustment.type === "quantity_adjusted") {
      return `${itemLabel}: quantity adjusted from ${adjustment.previousQuantity ?? 0} to ${adjustment.currentQuantity ?? 0}.`;
    }

    if (adjustment.type === "selection_updated") {
      if (adjustment.previousSelectedSize && adjustment.currentSelectedSize) {
        return `${adjustment.name}: updated from ${adjustment.previousSelectedSize} to ${adjustment.currentSelectedSize}.`;
      }

      if (adjustment.currentSelectedSize) {
        return `${adjustment.name}: updated to ${adjustment.currentSelectedSize}.`;
      }

      return `${adjustment.name}: selected option was updated to match the latest menu.`;
    }

    return `${itemLabel}: details were refreshed to match the latest menu.`;
  }

  function handleDeliveryDateChange(event: ChangeEvent<HTMLInputElement>) {
    clearFieldError("deliveryDate");
    const nextValue = event.target.value;
    const normalizedValue = clampCheckoutDateToSelectableMinimum(nextValue, deliveryMethod);
    setDeliveryDateValue(normalizedValue);
  }

  const onSubmit = async (formData: FormData) => {
    if (submitStateRef.current !== "idle") {
      return;
    }

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
      deliveryDate: deliveryDateValue || String(formData.get("deliveryDate") ?? ""),
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
      deliveryQuoteToken: deliveryMethod === "delivery" ? deliveryQuote?.quoteToken ?? "" : "",
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

    captureStorefrontEvent(STOREFRONT_EVENT_NAMES.checkoutStarted, {
      item_count: items.reduce((sum, item) => sum + item.quantity, 0),
      distinct_item_count: items.length,
      subtotal_ugx: subtotalUGX,
      delivery_method: result.data.deliveryMethod,
      has_delivery_quote: deliveryMethod === "pickup" ? false : hasValidDeliveryQuote,
      delivery_fee_ugx: deliveryMethod === "delivery" ? deliveryQuote?.deliveryFee ?? 0 : 0,
      total_ugx: totalUGX,
    });

    updateSubmitState("placing_order");
    const placingOrderStartedAt = performance.now();
    setErrors({});
    setStaleCartNotice(null);
    await waitForNextPaint();

    const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
    const checkoutSessionToken = getOrCreateCheckoutSessionToken();
    idempotencyKeyRef.current = idempotencyKey;

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Checkout-Session": checkoutSessionToken,
        },
        body: JSON.stringify({
          customer: result.data,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            selectedSize: item.selectedSize,
            selectedFlavor: item.selectedFlavor,
            cartSnapshot: {
              name: item.name,
              image: item.image,
              priceUGX: item.priceUGX,
            },
          })),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            message?: string;
            id?: string;
            redirectUrl?: string;
            code?: string;
            cart?: {
              items?: CartItem[];
              subtotalUGX?: number;
            };
          }
        | StaleCartPayload
        | null;

      if (!response.ok) {
        if (
          response.status === 409
          && isStaleCartPayload(payload)
          && Array.isArray(payload.cart?.items)
        ) {
          replaceItems(payload.cart.items);
          const staleCartAdjustments = Array.isArray(payload.adjustments) ? payload.adjustments : [];
          captureStorefrontEvent(STOREFRONT_EVENT_NAMES.checkoutStaleCart, {
            item_count: payload.cart.items.reduce((sum, item) => sum + item.quantity, 0),
            distinct_item_count: payload.cart.items.length,
            subtotal_ugx: payload.cart.subtotalUGX,
            ...buildStaleCartEventProperties(staleCartAdjustments),
          });
          setStaleCartNotice({
            message: payload.message ?? "We refreshed your cart to match the latest menu.",
            adjustments: staleCartAdjustments,
          });
          updateSubmitState("idle");
          return;
        }

        setErrors({ form: payload?.message ?? "Unable to place order. Please try again." });
        updateSubmitState("error");
        resetSubmitStateAfterError();
        return;
      }

      await waitForMinimumStateDuration(placingOrderStartedAt, MIN_PLACING_ORDER_STATE_MS);
      updateSubmitState("preparing_payment");
      const preparingPaymentStartedAt = performance.now();
      idempotencyKeyRef.current = null;
      await waitForNextPaint();
      if (payload?.redirectUrl) {
        captureStorefrontEvent(STOREFRONT_EVENT_NAMES.paymentRedirect, {
          order_id: payload.id ?? null,
          item_count: items.reduce((sum, item) => sum + item.quantity, 0),
          distinct_item_count: items.length,
          subtotal_ugx: subtotalUGX,
          delivery_fee_ugx: deliveryFeeUGX,
          total_ugx: totalUGX,
        });
        await waitForMinimumStateDuration(preparingPaymentStartedAt, MIN_PREPARING_PAYMENT_STATE_MS);
        updateSubmitState("redirecting");
        await waitForNextPaint();
        await wait(REDIRECTING_PAINT_DELAY_MS);
        window.location.assign(payload.redirectUrl);
        return;
      }

      if (payload?.id) {
        await waitForMinimumStateDuration(preparingPaymentStartedAt, MIN_PREPARING_PAYMENT_STATE_MS);
        updateSubmitState("redirecting");
        await waitForNextPaint();
        await wait(REDIRECTING_PAINT_DELAY_MS);
        const params = new URLSearchParams({
          orderId: payload.id,
        });
        router.push(`/payment/result?${params.toString()}`);
        return;
      }

      setErrors({ form: "Payment link missing. Please try again." });
      updateSubmitState("error");
      resetSubmitStateAfterError();
    } catch {
      setErrors({ form: "Network issue while placing order. Retry once and we will avoid duplicates." });
      updateSubmitState("error");
      resetSubmitStateAfterError();
    }
  };

  const submitButtonLabel =
    submitState === "placing_order"
      ? "Placing order..."
      : submitState === "preparing_payment"
        ? "Preparing payment..."
        : submitState === "redirecting"
          ? "Redirecting to payment..."
          : "Pay with Pesapal";

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
            onChange={(event) => handleDeliveryMethodChange(event.target.value as "delivery" | "pickup")}
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
          min={minimumSelectableDate}
          value={deliveryDateValue}
          onChange={handleDeliveryDateChange}
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

      {staleCartNotice && (
        <div className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">{staleCartNotice.message}</p>
          {staleCartNotice.adjustments.length > 0 && (
            <ul className="space-y-1 text-sm">
              {staleCartNotice.adjustments.map((adjustment, index) => (
                <li key={`${adjustment.type}:${adjustment.productId}:${index}`}>
                  {formatAdjustmentMessage(adjustment)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {deliveryMethod === "pickup"
            ? "Pickup keeps your total at the cart subtotal."
            : hasValidDeliveryQuote
              ? "Orders placed after 7:00 PM will be scheduled for the next delivery day."
              : "Choose a verified location before placing a delivery order."}
        </p>
        <Button
          disabled={
            items.length === 0
            || submitState !== "idle"
            || (requiresDeliveryQuote && !hasValidDeliveryQuote)
          }
        >
          {submitButtonLabel}
        </Button>
      </div>
      <p className="text-xs text-muted">
        Mobile money charges may apply and will be shown at checkout.
      </p>
    </form>
  );
}
