export function formatUGX(amount: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDistanceKm(distanceKm: number): string {
  return `${new Intl.NumberFormat("en-UG", {
    minimumFractionDigits: distanceKm < 10 ? 2 : 1,
    maximumFractionDigits: 2,
  }).format(distanceKm)} km`;
}

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
