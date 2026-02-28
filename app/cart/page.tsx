import { CartLayout } from "@/components/cart-layout";

export default function CartPage() {
  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <h1 className="text-4xl text-[#2D1F16]">Cart + Checkout</h1>
      <CartLayout />
    </div>
  );
}

