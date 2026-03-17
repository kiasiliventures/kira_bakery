"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatUGX } from "@/lib/format";
import { checkoutSchema, type CheckoutSchemaInput } from "@/lib/validation";

type CheckoutFormProps = {
  compact?: boolean;
};

export function CheckoutForm({ compact = false }: CheckoutFormProps) {
  const router = useRouter();
  const { items, subtotalUGX } = useCart();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup">(
    "delivery",
  );
  const idempotencyKeyRef = useRef<string | null>(null);

  const onSubmit = async (formData: FormData) => {
    const raw: CheckoutSchemaInput = {
      deliveryMethod: String(formData.get("deliveryMethod") ?? "delivery") as
        | "delivery"
        | "pickup",
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
          <Label htmlFor="customerName">Full Name</Label>
          <Input id="customerName" name="customerName" placeholder="Your name" />
          {errors.customerName && <p className="text-xs text-danger">{errors.customerName}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" placeholder="+256..." />
          {errors.phone && <p className="text-xs text-danger">{errors.phone}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" />
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
        <div className={`space-y-2 ${deliveryMethod === "pickup" ? "opacity-60" : ""}`}>
          <Label htmlFor="deliveryDate">Delivery Date</Label>
          <Input
            id="deliveryDate"
            name="deliveryDate"
            type="date"
            disabled={deliveryMethod === "pickup"}
            className={deliveryMethod === "pickup" ? "bg-field-disabled text-muted-foreground" : ""}
          />
          {errors.deliveryDate && <p className="text-xs text-danger">{errors.deliveryDate}</p>}
        </div>
      </div>
      <div className={`space-y-2 ${deliveryMethod === "pickup" ? "opacity-60" : ""}`}>
        <Label htmlFor="address">Delivery Address</Label>
        <Input
          id="address"
          name="address"
          placeholder="Kira, Wakiso..."
          disabled={deliveryMethod === "pickup"}
          className={deliveryMethod === "pickup" ? "bg-field-disabled text-muted-foreground" : ""}
        />
        {errors.address && <p className="text-xs text-danger">{errors.address}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" placeholder="Any special instructions?" />
      </div>
      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      <div className="flex items-center justify-between">
        <p className="font-semibold text-foreground">Total: {formatUGX(subtotalUGX)}</p>
        <Button disabled={items.length === 0 || isSubmitting}>
          {isSubmitting ? "Redirecting..." : "Pay with Pesapal"}
        </Button>
      </div>
      <p className="text-xs text-muted">
        Mobile money charges may apply and will be shown at checkout.
      </p>
    </form>
  );
}
