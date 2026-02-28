export function formatUGX(amount: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

