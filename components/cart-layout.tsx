"use client";

import Image from "next/image";
import { useState } from "react";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { getCartLineKey, useCart } from "@/components/providers/app-provider";
import { CheckoutForm } from "@/components/checkout-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUGX } from "@/lib/format";

export function CartLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { items, subtotalUGX, removeItem, updateQuantity } = useCart();

  return (
    <div className="relative grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-serif">Your Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 && (
            <p className="text-[#5f4637]">Your cart is empty. Add a few fresh items from the menu.</p>
          )}
          {items.map((item) => {
            const lineKey = getCartLineKey(item);
            return (
            <div
              key={lineKey}
              className="flex items-center gap-3 rounded-xl border border-[#c2a98f]/30 bg-[#fffaf5] p-3"
            >
              <div className="relative h-20 w-20 overflow-hidden rounded-xl">
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
              <div className="flex-1">
                <p className="font-medium text-[#2D1F16]">{item.name}</p>
                <p className="text-sm text-[#5f4637]">{formatUGX(item.priceUGX)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="rounded-lg border border-[#c2a98f]/40 p-1"
                    onClick={() => updateQuantity(lineKey, item.quantity - 1)}
                    aria-label="Decrease quantity"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <button
                    className="rounded-lg border border-[#c2a98f]/40 p-1"
                    onClick={() => updateQuantity(lineKey, item.quantity + 1)}
                    aria-label="Increase quantity"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <button
                className="rounded-lg p-2 text-[#8f2a2a] hover:bg-[#f4d4d4]"
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
            <p className="text-sm text-[#5f4637]">Subtotal: {formatUGX(subtotalUGX)}</p>
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
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-auto rounded-t-3xl bg-[#F6EFE7] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-serif text-xl">Checkout</h3>
              <button onClick={() => setMobileOpen(false)} aria-label="Close checkout">
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
