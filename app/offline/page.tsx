import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Offline",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 rounded-2xl bg-surface p-10 text-center shadow-[var(--shadow-card)]">
      <h1 className="text-4xl text-foreground">You are offline</h1>
      <p className="text-muted">
        Recently visited pages and cached product images can still open. Reconnect to place orders,
        confirm payments, or fetch the latest catalog updates.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/">
          <Button>Back to Home</Button>
        </Link>
        <Link href="/menu">
          <Button variant="outline">Open Menu</Button>
        </Link>
      </div>
    </div>
  );
}
