"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GOOGLE_REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJ61BuvrC3fRcRb74ErJeA7ws";

export function OrderReviewPrompt() {
  return (
    <Card className="mt-6 border-accent/20 bg-surface-alt">
      <CardHeader className="pb-4">
        <CardTitle className="font-serif text-2xl">
          Enjoyed your experience with Kira Bakery?
        </CardTitle>
        <CardDescription className="text-base leading-7">
          Once you&apos;ve received and enjoyed your cake, we&apos;d love to hear your feedback.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a
          href={GOOGLE_REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ className: "w-full sm:w-auto" }))}
        >
          Leave a Review on Google
        </a>
      </CardContent>
    </Card>
  );
}
