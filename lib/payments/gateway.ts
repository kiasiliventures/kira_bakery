import "server-only";

import { getPaymentProvider, type PaymentProviderName } from "@/lib/payments/config";
import { createDpoGateway } from "@/lib/payments/providers/dpo";
import { createPesapalGateway } from "@/lib/payments/providers/pesapal";

export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled";

export const paymentSyncSources = [
  "checkout",
  "initiate",
  "ipn",
  "callback",
  "status",
  "recovery",
  "admin_reverify",
] as const;

export type PaymentSyncSource = (typeof paymentSyncSources)[number];

export type PaymentInitiationInput = {
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  customerName: string;
  orderAccessLinkToken?: string | null;
  phone?: string | null;
  email?: string | null;
  requestOrigin?: string | null;
};

export type PaymentInitiationResult = {
  provider: PaymentProviderName;
  providerReference: string;
  redirectUrl: string | null;
  paymentStatus: PaymentStatus;
  rawResponse: unknown;
};

export type PaymentVerificationInput = {
  orderId: string;
  providerReference: string;
  merchantReference?: string | null;
  source: PaymentSyncSource;
};

export type PaymentVerificationResult = {
  provider: PaymentProviderName;
  providerReference: string;
  paymentStatus: PaymentStatus;
  providerStatus: string | null;
  paymentReference: string | null;
  amount: number | null;
  currency: string | null;
  rawResponse: unknown;
  verifiedAt: string;
};

export interface PaymentGateway {
  readonly provider: PaymentProviderName;
  initiatePayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult>;
  verifyPayment(input: PaymentVerificationInput): Promise<PaymentVerificationResult>;
}

export function getPaymentGateway(
  providerName: PaymentProviderName = getPaymentProvider(),
): PaymentGateway {
  if (providerName === "pesapal") {
    return createPesapalGateway();
  }

  return createDpoGateway();
}
