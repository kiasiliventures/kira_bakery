import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentResultView } from "@/components/payment-result-view";

export const metadata: Metadata = {
  title: "Payment Result",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center px-6 py-16 text-muted">Loading payment result...</main>}>
      <PaymentResultView />
    </Suspense>
  );
}
