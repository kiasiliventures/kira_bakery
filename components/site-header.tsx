"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartLink } from "@/components/cart-link";
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
    <header className="sticky top-0 z-50 border-b border-[#d7c6b4] bg-[#ede4da]">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5">
        <Link href="/" className="font-serif text-[2rem] font-semibold leading-none text-[#2D1F16]">
          KiRA Bakery
        </Link>
        <nav className="hidden items-center gap-1 rounded-xl bg-[#e7ddd2] p-1.5 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3.5 py-2 text-[0.95rem] font-medium text-[#5f4637] transition-colors hover:bg-[#f0e8df] hover:text-[#2D1F16]",
                pathname === link.href && "bg-[#f0e8df] text-[#2D1F16]",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <CartLink />
      </div>
    </header>
  );
}
