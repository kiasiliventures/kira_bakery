"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { resolveAuthRedirectPath } from "@/lib/auth/redirect";

export function normalizeNextPath(pathname: string | null) {
  return resolveAuthRedirectPath(pathname ?? undefined);
}

export function getCustomerLabel(email: string | undefined, fullName: string | undefined) {
  const normalizedFullName = fullName?.trim();
  if (normalizedFullName) {
    return normalizedFullName.split(/\s+/)[0] ?? normalizedFullName;
  }

  const normalizedEmail = email?.trim();
  if (!normalizedEmail) {
    return "Account";
  }

  return normalizedEmail.split("@")[0] ?? "Account";
}

export function AccountMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const nextPath = normalizeNextPath(pathname);

  if (isLoading) {
    return (
      <div className="hidden items-center gap-2 md:flex">
        <span className="text-sm text-muted">Checking account...</span>
      </div>
    );
  }

  if (!user) {
    const encodedNextPath = encodeURIComponent(nextPath);

    return (
      <div className="hidden items-center md:flex">
        <Link
          href={`/account/sign-up?next=${encodedNextPath}`}
          className="rounded-xl border-2 border-accent bg-surface px-3 py-2 text-sm font-semibold text-accent transition-colors hover:border-[var(--accent-hover)] hover:text-[var(--accent-hover)]"
        >
          Create account
        </Link>
      </div>
    );
  }

  const userMetadata = user.user_metadata as { full_name?: string } | undefined;

  return (
    <div className="hidden items-center gap-2 md:flex">
      <Link
        href="/account/orders"
        className="rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        My Orders
      </Link>
      <span className="max-w-28 truncate text-sm text-muted">
        {getCustomerLabel(user.email, userMetadata?.full_name)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={isSigningOut}
        onClick={() => {
          setIsSigningOut(true);
          void signOut()
            .then(() => {
              router.replace("/");
              router.refresh();
            })
            .finally(() => {
              setIsSigningOut(false);
            });
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
