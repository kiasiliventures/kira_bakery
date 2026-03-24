"use client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GOOGLE_REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJ61BuvrC3fRcRb74ErJeA7ws";

export function OrderReviewPrompt() {
  return (
    <section className="border-t border-border/60 pt-4">
      <h2 className="text-lg font-semibold text-foreground">
        Enjoyed your experience with Kira Bakery?
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
        Once you&apos;ve received and enjoyed your cake, we&apos;d love to hear your feedback.
      </p>
      <a
        href={GOOGLE_REVIEW_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "outline", size: "sm", className: "mt-3 w-full sm:w-auto" }))}
      >
        Leave a Review on Google
      </a>
    </section>
  );
}
