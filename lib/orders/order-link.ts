export function buildOrderPath(orderId: string, accessToken?: string | null) {
  const normalizedOrderId = orderId.trim();
  const normalizedAccessToken = accessToken?.trim() ?? "";
  const params = new URLSearchParams();

  if (normalizedAccessToken) {
    params.set("access", normalizedAccessToken);
  }

  const query = params.toString();
  const pathname = `/orders/${encodeURIComponent(normalizedOrderId)}`;
  return query ? `${pathname}?${query}` : pathname;
}
