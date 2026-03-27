"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  AccountMenu,
  getCustomerLabel,
  normalizeNextPath,
} from "@/components/auth/account-menu";
import { CartLink } from "@/components/cart-link";
import { useAuth } from "@/components/providers/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const desktopLinks = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/cake-builder", label: "Custom Cake" },
  { href: "/classes", label: "Classes" },
  { href: "/contact", label: "Contact" },
];

const mobileLinks = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Shop" },
  { href: "/cake-builder", label: "Cake Builder" },
  { href: "/classes", label: "Classes" },
  { href: "/contact", label: "Contact" },
];

function isActiveLink(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, signOut } = useAuth();
  const [mobileMenuPath, setMobileMenuPath] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const mobileDrawerId = useId();
  const nextPath = normalizeNextPath(pathname);
  const isMobileMenuOpen = mobileMenuPath === pathname;

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuPath(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  const encodedNextPath = encodeURIComponent(nextPath);
  const userMetadata = user?.user_metadata as { full_name?: string } | undefined;

  return (
    <>
      <header className="sticky top-0 z-[80] border-b border-border bg-[var(--header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3.5">
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-3 rounded-[1.35rem] border border-border bg-surface-alt px-3.5 py-2.5 text-left shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface md:hidden"
            aria-expanded={isMobileMenuOpen}
            aria-controls={mobileDrawerId}
            aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => {
              setMobileMenuPath((currentPath) => (currentPath === pathname ? null : pathname));
            }}
          >
            <div className="min-w-0">
              <span className="block truncate font-serif text-[1.35rem] font-semibold leading-none text-foreground">
                KiRA Bakery
              </span>
              <span className="mt-1 block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted">
                Browse menu
              </span>
            </div>
            <span
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition-transform duration-200",
                isMobileMenuOpen && "rotate-180 text-accent",
              )}
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </span>
          </button>
          <Link
            href="/"
            className="hidden shrink-0 font-serif text-[2rem] font-semibold leading-none text-foreground transition-colors hover:text-accent md:inline-flex"
          >
            KiRA Bakery
          </Link>
          <nav className="hidden items-center gap-1 rounded-2xl border border-border bg-surface-muted p-1.5 md:flex">
            {desktopLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-xl px-3.5 py-2 text-[0.95rem] font-medium text-muted transition-all duration-200 hover:bg-surface hover:text-foreground",
                  isActiveLink(pathname, link.href) && "bg-surface text-foreground shadow-[var(--shadow-soft)]",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <AccountMenu />
            <ThemeToggle />
            <CartLink />
          </div>
        </div>
      </header>

      <div
        className={cn(
          "fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm transition-opacity duration-200 md:hidden",
          isMobileMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!isMobileMenuOpen}
        onClick={() => {
          setMobileMenuPath(null);
        }}
      />

      <aside
        id={mobileDrawerId}
        aria-hidden={!isMobileMenuOpen}
        className={cn(
          "fixed inset-y-2 left-2 z-[90] flex w-[min(24rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-[var(--shadow-modal)] transition-transform duration-200 md:hidden",
          "pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
          isMobileMenuOpen ? "pointer-events-auto translate-x-0" : "pointer-events-none -translate-x-[110%]",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 pb-4">
          <div>
            <p className="font-serif text-2xl text-foreground">KiRA Bakery</p>
            <p className="mt-1 text-sm text-muted">Fresh picks, classes, cakes, and orders.</p>
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface-alt text-foreground shadow-[var(--shadow-soft)] transition-all duration-200 hover:bg-surface"
            aria-label="Close menu"
            onClick={() => {
              setMobileMenuPath(null);
            }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <nav className="space-y-2">
            {mobileLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center justify-between rounded-2xl border border-transparent bg-surface-alt px-4 py-3.5 text-base font-medium text-foreground transition-all duration-200 hover:border-border hover:bg-surface-muted",
                  isActiveLink(pathname, link.href) && "border-border bg-surface text-accent shadow-[var(--shadow-soft)]",
                )}
                onClick={() => {
                  setMobileMenuPath(null);
                }}
              >
                <span>{link.label}</span>
                <span className="text-sm text-muted">Open</span>
              </Link>
            ))}
          </nav>

          <div className="mt-6 rounded-[1.5rem] border border-border bg-surface-muted p-4">
            {isLoading ? (
              <p className="text-sm text-muted">Checking account...</p>
            ) : user ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Account</p>
                  <p className="mt-1 text-base font-semibold text-foreground">
                    {getCustomerLabel(user.email, userMetadata?.full_name)}
                  </p>
                  <p className="mt-1 text-sm text-muted">{user.email}</p>
                </div>
                <Link
                  href="/account/orders"
                  className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-foreground shadow-[var(--shadow-soft)] transition-all duration-200 hover:bg-background"
                  onClick={() => {
                    setMobileMenuPath(null);
                  }}
                >
                  <span>My Orders</span>
                  <span className="text-muted">View</span>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-between rounded-2xl border border-border bg-surface px-4 text-sm font-semibold"
                  loading={isSigningOut}
                  onClick={() => {
                    setIsSigningOut(true);
                    void signOut()
                      .then(() => {
                        setMobileMenuPath(null);
                        router.replace("/");
                        router.refresh();
                      })
                      .finally(() => {
                        setIsSigningOut(false);
                      });
                  }}
                >
                  <span>Sign out</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Account</p>
                  <p className="mt-1 text-base font-semibold text-foreground">Sign in to track orders</p>
                  <p className="mt-1 text-sm text-muted">
                    Save your bakery picks and check order history from your account.
                  </p>
                </div>
                <Link
                  href={`/account/sign-in?next=${encodedNextPath}`}
                  className="flex items-center justify-center rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground shadow-[var(--shadow-brand)] transition-all duration-200 hover:bg-[var(--accent-hover)]"
                  onClick={() => {
                    setMobileMenuPath(null);
                  }}
                >
                  Sign in
                </Link>
                <Link
                  href={`/account/sign-up?next=${encodedNextPath}`}
                  className="flex items-center justify-center rounded-2xl border-2 border-accent bg-surface px-4 py-3 text-sm font-semibold text-accent transition-colors hover:border-[var(--accent-hover)] hover:text-[var(--accent-hover)]"
                  onClick={() => {
                    setMobileMenuPath(null);
                  }}
                >
                  Create account
                </Link>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
