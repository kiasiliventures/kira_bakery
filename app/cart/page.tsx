import type { Metadata } from "next";
import { CartLayout } from "@/components/cart-layout";

export const metadata: Metadata = {
  title: "Cart",
  description: "Review your cart and proceed to checkout.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CartPage() {
  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <h1 className="text-4xl text-foreground">Cart + Checkout</h1>
      <CartLayout />
    </div>
  );
}
