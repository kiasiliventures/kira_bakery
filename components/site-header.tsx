"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartLink } from "@/components/cart-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/cake-builder", label: "Custom Cake" },
  { href: "/classes", label: "Classes" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-[var(--header-bg)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5">
        <Link
          href="/"
          className="font-serif text-[2rem] font-semibold leading-none text-foreground transition-colors hover:text-accent"
        >
          KiRA Bakery
        </Link>
        <nav className="hidden items-center gap-1 rounded-2xl border border-border bg-surface-muted p-1.5 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-xl px-3.5 py-2 text-[0.95rem] font-medium text-muted transition-all duration-200 hover:bg-surface hover:text-foreground",
                pathname === link.href && "bg-surface text-foreground shadow-[var(--shadow-soft)]",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <CartLink />
        </div>
      </div>
    </header>
  );
}
