import "server-only";

import { fetchWithTimeout } from "@/lib/http/fetch";
import {
  requireInternalRequestSigningSecret,
  signInternalRequestToken,
} from "@/lib/internal-auth";

const ADMIN_PAID_ORDER_PUSH_TIMEOUT_MS = 8_000;
const ADMIN_PAID_ORDER_PUSH_PURPOSE = "admin_paid_order_push_dispatch";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getAdminDashboardBaseUrl() {
  return requireEnv("ADMIN_DASHBOARD_BASE_URL").replace(/\/+$/, "");
}

export async function triggerAdminPaidOrderPushDispatch(orderId: string) {
  const path = "/api/internal/push/admin-paid-orders/process";
  const token = signInternalRequestToken({
    secret: requireInternalRequestSigningSecret("STOREFRONT_INTERNAL_AUTH_TOKEN"),
    issuer: "kira-bakery-storefront",
    audience: "kira-bakery-admin",
    purpose: ADMIN_PAID_ORDER_PUSH_PURPOSE,
    method: "POST",
    path,
    orderId,
  });

  const response = await fetchWithTimeout(`${getAdminDashboardBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId }),
    cache: "no-store",
  }, {
    operationName: "Admin paid-order push dispatch",
    timeoutMs: ADMIN_PAID_ORDER_PUSH_TIMEOUT_MS,
  });

  if (response.ok) {
    return;
  }

  const payload = await response.json().catch(() => null) as
    | { message?: string }
    | null;

  throw new Error(
    payload?.message
      ?? `Admin paid-order push dispatch failed with status ${response.status}.`,
  );
}
