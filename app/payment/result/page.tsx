import { Suspense } from "react";
import { PaymentResultView } from "@/components/payment-result-view";

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center px-6 py-16 text-[#5b4431]">Loading payment result...</main>}>
      <PaymentResultView />
    </Suspense>
  );
}
