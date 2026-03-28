"use client";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const GOOGLE_REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJ61BuvrC3fRcRb74ErJeA7ws";

export function OrderReviewPrompt() {
  return (
    <Card className="rounded-[28px] border-2 border-accent/30 bg-surface shadow-[var(--shadow-card)]">
      <CardHeader className="gap-2 p-8 pb-4">
        <CardTitle className="font-serif text-2xl text-foreground">
          Enjoyed your experience with Kira Bakery?
        </CardTitle>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Once you&apos;ve received and enjoyed your cake, we&apos;d love to hear your feedback.
        </p>
      </CardHeader>
      <CardContent className="p-8 pt-0">
        <a
          href={GOOGLE_REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm", className: "w-full sm:w-auto" }))}
        >
          Leave a Review on Google
        </a>
      </CardContent>
    </Card>
  );
}
