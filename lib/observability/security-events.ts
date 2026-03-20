import "server-only";

import { createHash } from "node:crypto";

type SecurityEventSeverity = "info" | "warning" | "error";

type SecurityEventInput = {
  event: string;
  severity?: SecurityEventSeverity;
  request?: Request;
  details?: Record<string, unknown>;
  report?: {
    key?: string;
    thresholds?: number[];
    windowMs?: number;
  };
};

type RepeatedEventBucket = {
  count: number;
  expiresAt: number;
  reportedThresholds: number[];
};

const repeatedSecurityEventStore = new Map<string, RepeatedEventBucket>();
const DEFAULT_REPORT_THRESHOLDS = [5, 10, 25];
const DEFAULT_REPORT_WINDOW_MS = 10 * 60_000;
const REPEATED_EVENT_CLEANUP_INTERVAL_MS = 60_000;

let lastRepeatedEventCleanupAt = 0;

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
    if (value) {
      return value.trim();
    }
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

function buildRequestFingerprint(request: Request) {
  const clientIp = getClientIp(request);
  const userAgent = request.headers.get("user-agent")?.trim() || "unknown";
  return createHash("sha256")
    .update(`${clientIp}|${userAgent}`)
    .digest("hex")
    .slice(0, 24);
}

function cleanupRepeatedEventStore(now: number) {
  const shouldCleanup =
    lastRepeatedEventCleanupAt === 0
    || now - lastRepeatedEventCleanupAt >= REPEATED_EVENT_CLEANUP_INTERVAL_MS;

  if (!shouldCleanup) {
    return;
  }

  for (const [key, value] of repeatedSecurityEventStore.entries()) {
    if (value.expiresAt <= now) {
      repeatedSecurityEventStore.delete(key);
    }
  }

  lastRepeatedEventCleanupAt = now;
}

function trackRepeatedSecurityEvent(
  reportKey: string,
  thresholds: number[],
  windowMs: number,
) {
  const now = Date.now();
  cleanupRepeatedEventStore(now);

  const existing = repeatedSecurityEventStore.get(reportKey);
  const bucket =
    !existing || existing.expiresAt <= now
      ? {
          count: 1,
          expiresAt: now + windowMs,
          reportedThresholds: [],
        }
      : {
          ...existing,
          count: existing.count + 1,
        };

  repeatedSecurityEventStore.set(reportKey, bucket);

  const triggeredThresholds = thresholds.filter(
    (threshold) => bucket.count >= threshold && !bucket.reportedThresholds.includes(threshold),
  );

  if (triggeredThresholds.length > 0) {
    bucket.reportedThresholds.push(...triggeredThresholds);
    repeatedSecurityEventStore.set(reportKey, bucket);
  }

  return {
    count: bucket.count,
    triggeredThresholds,
    windowMs,
  };
}

function writeStructuredLog(
  severity: SecurityEventSeverity,
  payload: Record<string, unknown>,
) {
  const serialized = JSON.stringify(payload);
  if (severity === "info") {
    console.info(serialized);
    return;
  }

  if (severity === "warning") {
    console.warn(serialized);
    return;
  }

  console.error(serialized);
}

export function logSecurityEvent(input: SecurityEventInput) {
  const severity = input.severity ?? "warning";
  const requestContext = input.request
    ? {
        method: input.request.method,
        path: new URL(input.request.url).pathname,
        fingerprint: buildRequestFingerprint(input.request),
      }
    : null;

  const payload = {
    type: "security_event",
    timestamp: new Date().toISOString(),
    severity,
    event: input.event,
    request: requestContext,
    details: input.details ?? {},
  };

  writeStructuredLog(severity, payload);

  if (!input.report) {
    return;
  }

  const thresholds = input.report.thresholds ?? DEFAULT_REPORT_THRESHOLDS;
  const windowMs = input.report.windowMs ?? DEFAULT_REPORT_WINDOW_MS;
  const reportKey =
    input.report.key
    ?? [input.event, requestContext?.path ?? "global", requestContext?.fingerprint ?? "global"].join(":");
  const report = trackRepeatedSecurityEvent(reportKey, thresholds, windowMs);

  for (const threshold of report.triggeredThresholds) {
    writeStructuredLog("warning", {
      type: "security_report",
      timestamp: new Date().toISOString(),
      event: "security_threshold_exceeded",
      observedEvent: input.event,
      reportKey,
      threshold,
      count: report.count,
      windowMs: report.windowMs,
      request: requestContext,
      details: input.details ?? {},
    });
  }
}
