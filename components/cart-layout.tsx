"use client";

import { useState, useSyncExternalStore } from "react";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { getCartLineKey, useCart } from "@/components/providers/app-provider";
import { StorefrontProductImage } from "@/components/storefront-product-image";
import { CheckoutForm } from "@/components/checkout-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUGX } from "@/lib/format";

export function CartLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { items, subtotalUGX, removeItem, updateQuantity } = useCart();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <div className="relative grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-serif">Your Cart</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted">Loading cart...</p>
          </CardContent>
        </Card>

        <div className="hidden lg:block">
          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle className="font-serif text-xl">Checkout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted">Subtotal: {formatUGX(0)}</p>
              <Button disabled>Place Order</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-serif">Your Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 && (
            <p className="text-muted">Your cart is empty. Add a few fresh items from the menu.</p>
          )}
          {items.map((item) => {
            const lineKey = getCartLineKey(item);
            const lowStockCount =
              typeof item.stockQuantity === "number" && item.stockQuantity > 0 && item.stockQuantity < 10
                ? item.stockQuantity
                : null;
            const hasReachedStockLimit =
              typeof item.stockQuantity === "number" && item.quantity >= item.stockQuantity;
            return (
              <div
                key={lineKey}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-alt p-3"
              >
                <div className="relative h-20 w-20 overflow-hidden rounded-xl">
                  <StorefrontProductImage src={item.image} alt={item.name} variant="thumb" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="text-sm text-muted">{formatUGX(item.priceUGX)}</p>
                  {lowStockCount ? (
                    <p className="mt-1 text-xs font-medium text-badge-foreground">
                      Only {lowStockCount} left in stock
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      className="rounded-lg border border-border bg-surface px-1.5 py-1 text-foreground transition-colors hover:bg-surface-muted"
                      onClick={() => updateQuantity(lineKey, item.quantity - 1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center text-sm text-foreground">{item.quantity}</span>
                    <button
                      className="rounded-lg border border-border bg-surface px-1.5 py-1 text-foreground transition-colors hover:bg-surface-muted"
                      onClick={() => updateQuantity(lineKey, item.quantity + 1)}
                      aria-label="Increase quantity"
                      disabled={hasReachedStockLimit}
                      title={hasReachedStockLimit ? "No more stock available" : undefined}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <button
                  className="rounded-lg p-2 text-danger transition-colors hover:bg-danger-soft"
                  onClick={() => removeItem(lineKey)}
                  aria-label="Remove item"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="hidden lg:block">
        <Card className="sticky top-24">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Checkout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted">Subtotal: {formatUGX(subtotalUGX)}</p>
            <CheckoutForm compact />
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-4 z-40 px-4 lg:hidden">
        <Button className="w-full rounded-2xl shadow-xl" size="lg" onClick={() => setMobileOpen(true)}>
          <ShoppingCart className="mr-2" size={16} />
          Checkout ({formatUGX(subtotalUGX)})
        </Button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 lg:hidden">
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-auto rounded-t-3xl border border-border bg-surface p-4 shadow-[var(--shadow-modal)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-serif text-xl text-foreground">Checkout</h3>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close checkout"
                className="rounded-lg p-2 text-foreground transition-colors hover:bg-surface-muted"
              >
                <X size={20} />
              </button>
            </div>
            <CheckoutForm />
          </div>
        </div>
      )}
    </div>
  );
}
