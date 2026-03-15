import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 rounded-2xl bg-surface p-10 text-center shadow-[var(--shadow-card)]">
      <h1 className="text-4xl text-foreground">You are offline</h1>
      <p className="text-muted">
        Core pages remain available. Reconnect to place orders or fetch new content.
      </p>
      <Link href="/">
        <Button>Back to Home</Button>
      </Link>
    </div>
  );
}
