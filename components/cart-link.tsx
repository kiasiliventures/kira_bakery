"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/providers/app-provider";

export function CartLink() {
  const { itemCount } = useCart();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <Link
      href="/cart"
      className="inline-flex min-w-14 items-center justify-center gap-2 rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm text-foreground shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface"
    >
      <ShoppingBag size={16} />
      <span>{mounted ? itemCount : 0}</span>
    </Link>
  );
}
