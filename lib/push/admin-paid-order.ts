import "server-only";

import { fetchWithTimeout } from "@/lib/http/fetch";
import {
  requireInternalRequestSigningSecret,
  signInternalRequestToken,
} from "@/lib/internal-auth";
// lazily import Supabase client inside the enqueue helper to avoid
// top-level import time coupling that breaks test hoisting/mocking.

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
  const url = `${getAdminDashboardBaseUrl()}${path}`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const maxAttempts = 3;
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < maxAttempts) {
    try {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ orderId }),
        cache: "no-store",
      }, {
        operationName: "Admin paid-order push dispatch",
        timeoutMs: ADMIN_PAID_ORDER_PUSH_TIMEOUT_MS,
      });

      if (response.ok) {
        return;
      }

      const payload = await response.json().catch(() => null) as { message?: string } | null;
      const status = response.status;

      // Retry on server errors (5xx)
      if (status >= 500 && attempt < maxAttempts - 1) {
        lastError = new Error(payload?.message ?? `Admin paid-order push dispatch failed with status ${status}.`);
        attempt += 1;
        const delayMs = 300 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw new Error(payload?.message ?? `Admin paid-order push dispatch failed with status ${status}.`);
    } catch (error) {
      lastError = error;

      // Retry on network / timeout errors
      if (attempt < maxAttempts - 1) {
        attempt += 1;
        const delayMs = 300 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw error;
    }
  }

  // final durable fallback: enqueue a retry row in the DB so a worker can pick it up
  try {
    await enqueueAdminPushRetry(
      orderId,
      url,
      { orderId },
      undefined,
      lastError instanceof Error ? lastError.name : "network_error",
      lastError instanceof Error ? lastError.message : String(lastError),
    );
  } catch (enqueueError) {
    // Log but continue to rethrow original error for upstream handling
    // eslint-disable-next-line no-console
    console.error("admin_push_retry_enqueue_failed_final", {
      orderId,
      enqueueError: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
    });
  }

  throw lastError instanceof Error ? lastError : new Error("Admin paid-order push dispatch failed.");
}

export async function enqueueAdminPushRetry(
  orderId: string,
  targetUrl: string,
  body: unknown,
  dispatchId?: string | null,
  failureCode?: string | null,
  lastError?: string | null,
) {
  const { getSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = getSupabaseServerClient();
  const idempotencyKey = `admin_paid_order:${orderId}`;

  const payload = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  };

  const record = {
    idempotency_key: idempotencyKey,
    dispatch_id: dispatchId ?? null,
    order_id: orderId,
    target_url: targetUrl,
    payload,
    failure_code: failureCode ?? null,
    last_error: lastError ?? null,
    next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
  } as const;

  const { data, error } = await supabase
    .from("admin_push_retry_queue")
    .upsert(record, { onConflict: "idempotency_key" })
    .select("id");

  if (error) {
    // eslint-disable-next-line no-console
    console.error("admin_push_retry_upsert_error", { orderId, error: error.message });
  } else {
    // eslint-disable-next-line no-console
    console.info("admin_push_retry_enqueued", { orderId, id: data?.[0]?.id ?? null });
  }
}
