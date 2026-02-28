import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 rounded-2xl bg-white p-10 text-center shadow-[0_10px_30px_rgba(76,43,24,0.08)]">
      <h1 className="text-4xl text-[#2D1F16]">You are offline</h1>
      <p className="text-[#5f4637]">
        Core pages remain available. Reconnect to place orders or fetch new content.
      </p>
      <Link href="/">
        <Button>Back to Home</Button>
      </Link>
    </div>
  );
}

