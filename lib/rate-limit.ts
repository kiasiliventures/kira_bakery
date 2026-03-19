import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type LocalBucket = {
  hits: number;
  expiresAt: number;
};

const localRateLimitStore = new Map<string, LocalBucket>();
const LOCAL_RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;
const LOCAL_RATE_LIMIT_MAX_BUCKETS = 5_000;

let lastLocalRateLimitCleanupAt = 0;

function hasKnownProxyMarker(request: Request) {
  return Boolean(
    request.headers.get("cf-ray")
    || request.headers.get("fly-region")
    || request.headers.get("x-vercel-id"),
  );
}

function getClientIp(request: Request): string {
  const trustedHeaderCandidates = ["cf-connecting-ip", "fly-client-ip"];

  for (const header of trustedHeaderCandidates) {
    const value = request.headers.get(header);
    if (!value) {
      continue;
    }

    return value.trim();
  }

  const allowGenericForwardingHeaders =
    process.env.NODE_ENV !== "production" || hasKnownProxyMarker(request);

  if (allowGenericForwardingHeaders) {
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) {
      return realIp;
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0]?.trim() || "unknown";
    }
  }

  return "unknown";
}

function buildRateLimitKey(request: Request, key: string) {
  const clientIp = getClientIp(request);
  const userAgent = request.headers.get("user-agent")?.trim() || "unknown";
  const fingerprint = createHash("sha256")
    .update(`${clientIp}|${userAgent}`)
    .digest("hex");

  return `${key}:${fingerprint}`;
}

function pruneExpiredLocalBuckets(now: number) {
  for (const [key, value] of localRateLimitStore.entries()) {
    if (value.expiresAt <= now) {
      localRateLimitStore.delete(key);
    }
  }
}

function cleanupLocalRateLimitStore(now: number, options?: { force?: boolean }) {
  const shouldCleanup =
    options?.force
    || lastLocalRateLimitCleanupAt === 0
    || now - lastLocalRateLimitCleanupAt >= LOCAL_RATE_LIMIT_CLEANUP_INTERVAL_MS;

  if (!shouldCleanup) {
    return;
  }

  pruneExpiredLocalBuckets(now);
  lastLocalRateLimitCleanupAt = now;
}

function evictOldestLocalBucket() {
  const oldestKey = localRateLimitStore.keys().next().value;
  if (!oldestKey) {
    return false;
  }

  localRateLimitStore.delete(oldestKey);
  return true;
}

function ensureLocalRateLimitCapacity(now: number) {
  if (localRateLimitStore.size < LOCAL_RATE_LIMIT_MAX_BUCKETS) {
    return;
  }

  cleanupLocalRateLimitStore(now, { force: true });

  if (localRateLimitStore.size < LOCAL_RATE_LIMIT_MAX_BUCKETS) {
    return;
  }

  if (evictOldestLocalBucket()) {
    console.warn("rate_limit_local_store_evicted_oldest_bucket", {
      size: localRateLimitStore.size,
      maxBuckets: LOCAL_RATE_LIMIT_MAX_BUCKETS,
    });
  }
}

function consumeLocalRateLimit(
  bucketKey: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  cleanupLocalRateLimitStore(now);

  const existing = localRateLimitStore.get(bucketKey);
  if (!existing || existing.expiresAt <= now) {
    ensureLocalRateLimitCapacity(now);
    localRateLimitStore.set(bucketKey, {
      hits: 1,
      expiresAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }

  existing.hits += 1;
  localRateLimitStore.set(bucketKey, existing);

  return {
    allowed: existing.hits <= limit,
    remaining: Math.max(0, limit - Math.min(existing.hits, limit)),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
  };
}

export async function enforceRateLimit(
  request: Request,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const supabase = getSupabaseServerClient();
  const bucketKey = buildRateLimitKey(request, key);
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    rate_key: bucketKey,
    max_requests: limit,
    window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
  });

  if (error) {
    console.error("rate_limit_consume_failed", {
      key,
      error: error.message,
    });
    return consumeLocalRateLimit(bucketKey, limit, windowMs);
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    console.error("rate_limit_consume_empty_response", { key });
    return consumeLocalRateLimit(bucketKey, limit, windowMs);
  }

  return {
    allowed: Boolean(row.allowed),
    remaining: typeof row.remaining === "number" ? row.remaining : 0,
    retryAfterSeconds:
      typeof row.retry_after_seconds === "number"
        ? Math.max(1, row.retry_after_seconds)
        : Math.max(1, Math.ceil(windowMs / 1000)),
  };
}
