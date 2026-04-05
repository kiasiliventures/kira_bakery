"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/providers/app-provider";
import { formatUGX } from "@/lib/format";
import { cn } from "@/lib/utils";

const HIDE_ON_PATH_PREFIXES = ["/cart", "/payment", "/orders", "/account"];
const RECENT_ADD_EMPHASIS_MS = 1400;

function shouldShowOnPath(pathname: string) {
  return !HIDE_ON_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function AnimatedCount({ value }: { value: number }) {
  return (
    <span
      key={value}
      className="inline-flex min-w-[1.5ch] justify-center tabular-nums animate-cart-count"
    >
      {value}
    </span>
  );
}

export function MobileCartBar() {
  const pathname = usePathname();
  const { itemCount, subtotalUGX, lastItemAddedAt } = useCart();
  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAddEmphasized, setIsAddEmphasized] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 16);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!lastItemAddedAt) {
      return;
    }

    setIsAddEmphasized(true);
    const timeoutId = window.setTimeout(() => {
      setIsAddEmphasized(false);
    }, RECENT_ADD_EMPHASIS_MS);

    return () => window.clearTimeout(timeoutId);
  }, [lastItemAddedAt]);

  const hydratedItemCount = mounted ? itemCount : 0;
  const hydratedSubtotalUGX = mounted ? subtotalUGX : 0;
  const shouldRender = mounted && hydratedItemCount > 0 && shouldShowOnPath(pathname);
  const isSolid = isScrolled || isAddEmphasized;
  const totalText = useMemo(() => formatUGX(hydratedSubtotalUGX), [hydratedSubtotalUGX]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[85] lg:hidden",
        shouldRender ? "translate-y-0" : "translate-y-full",
      )}
      aria-hidden={!shouldRender}
    >
      <div
        className="mx-auto w-full max-w-6xl px-4 pt-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <Link
          href="/cart"
          className={cn(
            "pointer-events-auto flex h-14 items-center justify-between gap-4 rounded-[1.35rem] border px-4 md:h-[60px] shadow-[var(--shadow-brand)] transition-all duration-300 ease-out",
            "backdrop-blur-xl will-change-transform",
            shouldRender ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
            isSolid
              ? "border-accent bg-accent text-accent-foreground"
              : "border-accent bg-white text-accent",
            isAddEmphasized && "animate-cart-bar-emphasis",
          )}
        >
          <div className="min-w-0 text-sm font-semibold">
            <span className="inline-flex items-center gap-1">
              <AnimatedCount value={hydratedItemCount} />
              <span>{hydratedItemCount === 1 ? "item" : "items"}</span>
            </span>
            <span className={cn("mx-2 opacity-70", isSolid ? "text-white/70" : "text-accent/70")}>•</span>
            <span className="tabular-nums">{totalText}</span>
          </div>
          <span className="shrink-0 text-sm font-semibold">
            View Cart <span aria-hidden>→</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
