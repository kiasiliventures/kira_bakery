import "server-only";

export type PaymentProviderName = "pesapal" | "dpo";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function parsePaymentProviderName(
  value: string | null | undefined,
): PaymentProviderName | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "pesapal" || normalized === "dpo") {
    return normalized;
  }

  throw new Error(`Unsupported payment provider: ${value}`);
}

export function getPaymentProvider(): PaymentProviderName {
  return parsePaymentProviderName(process.env.PAYMENT_PROVIDER) ?? "pesapal";
}

export function getPaymentEnv(): string {
  return process.env.PAYMENT_ENV?.trim().toLowerCase() || "sandbox";
}

export function getRequiredEnv(name: string): string {
  return requireEnv(name);
}
