"use client";

import posthog from "posthog-js";
import type { StaleCartAdjustment } from "@/types/order";

export const STOREFRONT_EVENT_NAMES = {
  menuItemView: "menu_item_view",
  addToCart: "add_to_cart",
  checkoutStarted: "checkout_started",
  checkoutStaleCart: "checkout_stale_cart",
  paymentRedirect: "payment_redirect",
  orderCompleted: "order_completed",
} as const;

type Primitive = string | number | boolean | null | undefined;
type EventProperties = Record<string, Primitive>;

function isPostHogEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}

export function captureStorefrontEvent(
  event: (typeof STOREFRONT_EVENT_NAMES)[keyof typeof STOREFRONT_EVENT_NAMES],
  properties: EventProperties = {},
) {
  if (!isPostHogEnabled()) {
    return;
  }

  posthog.capture(event, properties);
}

export function buildStaleCartEventProperties(adjustments: StaleCartAdjustment[]) {
  const counts = adjustments.reduce<Record<string, number>>((summary, adjustment) => {
    summary[adjustment.type] = (summary[adjustment.type] ?? 0) + 1;
    return summary;
  }, {});

  return {
    adjustment_count: adjustments.length,
    price_changed_count: counts.price_changed ?? 0,
    item_unavailable_count: counts.item_unavailable ?? 0,
    quantity_adjusted_count: counts.quantity_adjusted ?? 0,
    selection_updated_count: counts.selection_updated ?? 0,
    details_updated_count: counts.details_updated ?? 0,
  };
}
