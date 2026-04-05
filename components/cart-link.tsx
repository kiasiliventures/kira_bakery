"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/providers/app-provider";
import { cn } from "@/lib/utils";

const RECENT_ADD_BOUNCE_MS = 280;

function AnimatedBadgeCount({ value }: { value: number }) {
  return (
    <span
      key={value}
      className="inline-flex min-w-[1.5ch] justify-center tabular-nums animate-cart-count"
    >
      {value}
    </span>
  );
}

export function CartLink() {
  const { itemCount, lastItemAddedAt } = useCart();
  const [mounted, setMounted] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!lastItemAddedAt) {
      return;
    }

    setIsBouncing(true);
    const timeoutId = window.setTimeout(() => {
      setIsBouncing(false);
    }, RECENT_ADD_BOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [lastItemAddedAt]);

  const visibleCount = mounted ? itemCount : 0;

  return (
    <Link
      href="/cart"
      aria-label={`View cart with ${visibleCount} ${visibleCount === 1 ? "item" : "items"}`}
      className={cn(
        "relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-alt text-foreground shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface",
        isBouncing && "animate-cart-bounce",
      )}
    >
      <ShoppingBag className="h-5 w-5" aria-hidden />
      <span
        className={cn(
          "absolute -right-1 -top-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-[var(--header-bg)] bg-accent px-1.5 text-[0.72rem] font-semibold leading-none text-accent-foreground shadow-[var(--shadow-brand)] transition-transform duration-200",
          visibleCount > 0 ? "scale-100" : "scale-0",
        )}
      >
        <AnimatedBadgeCount value={visibleCount} />
      </span>
    </Link>
  );
}
