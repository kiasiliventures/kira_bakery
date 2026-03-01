"use client";

import * as React from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BakeryButtonProps = Omit<ButtonProps, "variant">;

export function PrimaryButton({ className, ...props }: BakeryButtonProps) {
  return <Button className={cn("rounded-2xl", className)} variant="default" {...props} />;
}

export function SecondaryButton({ className, ...props }: BakeryButtonProps) {
  return <Button className={cn("rounded-2xl", className)} variant="outline" {...props} />;
}

export function GhostButton({ className, ...props }: BakeryButtonProps) {
  return <Button className={cn("rounded-xl", className)} variant="ghost" {...props} />;
}

type IconButtonProps = Omit<BakeryButtonProps, "size" | "children"> & {
  icon: React.ReactNode;
  label: string;
};

export function IconButton({ icon, label, className, ...props }: IconButtonProps) {
  return (
    <Button
      className={cn("rounded-2xl", className)}
      size="icon"
      aria-label={label}
      title={label}
      {...props}
    >
      {icon}
    </Button>
  );
}

type AddToCartButtonProps = Omit<BakeryButtonProps, "onClick"> & {
  initialQuantity?: number;
  onQuantityChange?: (nextQuantity: number) => void;
  onAddToCart?: (quantity: number) => void;
};

export function AddToCartButton({
  initialQuantity = 1,
  onQuantityChange,
  onAddToCart,
  className,
  loading,
  disabled,
  ...props
}: AddToCartButtonProps) {
  const [quantity, setQuantity] = React.useState(Math.max(1, initialQuantity));

  const updateQuantity = (next: number) => {
    const normalized = Math.max(1, next);
    setQuantity(normalized);
    onQuantityChange?.(normalized);
  };

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label="Decrease quantity"
        onClick={() => updateQuantity(quantity - 1)}
        disabled={disabled || loading || quantity <= 1}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <span className="min-w-8 text-center text-sm font-semibold text-foreground">{quantity}</span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label="Increase quantity"
        onClick={() => updateQuantity(quantity + 1)}
        disabled={disabled || loading}
      >
        <Plus className="h-4 w-4" />
      </Button>
      <PrimaryButton
        type="button"
        className="min-h-11 min-w-[9rem] px-5"
        loading={loading}
        disabled={disabled}
        onClick={() => onAddToCart?.(quantity)}
        {...props}
      >
        <ShoppingCart className="h-4 w-4" />
        Add to Cart
      </PrimaryButton>
    </div>
  );
}

export function CheckoutButton({ className, children, ...props }: BakeryButtonProps) {
  return (
    <PrimaryButton
      className={cn(
        "h-[3.25rem] rounded-2xl px-8 text-base font-bold shadow-[0_12px_24px_rgba(148,2,2,0.26)]",
        className,
      )}
      {...props}
    >
      {children ?? "Proceed to Checkout"}
    </PrimaryButton>
  );
}
