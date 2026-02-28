"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/providers/app-provider";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/cake-builder", label: "Custom Cake" },
  { href: "/classes", label: "Classes" },
  { href: "/contact", label: "Contact" },
  { href: "/admin", label: "Admin" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { itemCount } = useCart();

  return (
    <header className="sticky top-0 z-50 border-b border-[#c2a98f]/30 bg-[#F6EFE7]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-serif text-xl font-bold text-[#2D1F16]">
          KiRA Bakery
        </Link>
        <nav className="hidden gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-[#5f4637] transition-colors hover:bg-[#efe3d6] hover:text-[#2D1F16]",
                pathname === link.href && "bg-[#efe3d6] text-[#2D1F16]",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/cart"
          className="inline-flex items-center gap-2 rounded-xl border border-[#c2a98f]/50 bg-white px-3 py-2 text-sm text-[#2D1F16]"
        >
          <ShoppingBag size={16} />
          <span>{itemCount}</span>
        </Link>
      </div>
    </header>
  );
}

