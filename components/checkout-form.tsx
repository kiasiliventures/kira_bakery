"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatUGX, generateId } from "@/lib/format";
import { getOrderRepository } from "@/lib/repository-provider";
import { checkoutSchema, type CheckoutSchemaInput } from "@/lib/validation";
import type { CheckoutFormData, Order } from "@/types/order";

type CheckoutFormProps = {
  compact?: boolean;
};

export function CheckoutForm({ compact = false }: CheckoutFormProps) {
  const router = useRouter();
  const { items, subtotalUGX, clearCart } = useCart();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (formData: FormData) => {
    const raw: CheckoutSchemaInput = {
      customerName: String(formData.get("customerName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      address: String(formData.get("address") ?? ""),
      deliveryDate: String(formData.get("deliveryDate") ?? ""),
      notes: String(formData.get("notes") ?? ""),
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

    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    });

    if (!response.ok) {
      setIsSubmitting(false);
      setErrors({ form: "Server validation failed. Please review your details." });
      return;
    }

    const customer: CheckoutFormData = {
      ...result.data,
      email: result.data.email || undefined,
      notes: result.data.notes || undefined,
    };

    const order: Order = {
      id: generateId("order"),
      createdAt: new Date().toISOString(),
      items,
      status: "Pending",
      totalUGX: subtotalUGX,
      customer,
    };

    const repository = getOrderRepository();
    await repository.create(order);
    clearCart();
    setIsSubmitting(false);
    router.push("/admin");
  };

  return (
    <form action={onSubmit} className="space-y-4">
      <div className={compact ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
        <div className="space-y-2">
          <Label htmlFor="customerName">Full Name</Label>
          <Input id="customerName" name="customerName" placeholder="Your name" />
          {errors.customerName && <p className="text-xs text-[#8f2a2a]">{errors.customerName}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" placeholder="+256..." />
          {errors.phone && <p className="text-xs text-[#8f2a2a]">{errors.phone}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" />
          {errors.email && <p className="text-xs text-[#8f2a2a]">{errors.email}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="deliveryDate">Delivery Date</Label>
          <Input id="deliveryDate" name="deliveryDate" type="date" />
          {errors.deliveryDate && <p className="text-xs text-[#8f2a2a]">{errors.deliveryDate}</p>}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Delivery Address</Label>
        <Input id="address" name="address" placeholder="Kira, Wakiso..." />
        {errors.address && <p className="text-xs text-[#8f2a2a]">{errors.address}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" placeholder="Any special instructions?" />
      </div>
      {errors.form && <p className="text-sm text-[#8f2a2a]">{errors.form}</p>}
      <div className="flex items-center justify-between">
        <p className="font-semibold text-[#2D1F16]">Total: {formatUGX(subtotalUGX)}</p>
        <Button disabled={items.length === 0 || isSubmitting}>
          {isSubmitting ? "Placing..." : "Place Order"}
        </Button>
      </div>
    </form>
  );
}

