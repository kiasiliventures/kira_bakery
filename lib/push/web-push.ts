import "server-only";

import webpush from "web-push";

export type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string | null;
  platform: string | null;
  user_agent: string | null;
};

export type PushNotificationPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
};

let vapidConfigured = false;
const PUSH_TTL_SECONDS = 300;
const MAX_PUSH_TOPIC_LENGTH = 32;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function configureWebPush() {
  if (vapidConfigured) {
    return;
  }

  webpush.setVapidDetails(
    requireEnv("VAPID_SUBJECT"),
    requireEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    requireEnv("VAPID_PRIVATE_KEY"),
  );
  vapidConfigured = true;
}

function buildPushTopic(tag: string | undefined) {
  const sanitized = tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, MAX_PUSH_TOPIC_LENGTH);
  return sanitized ? sanitized : undefined;
}

export async function sendWebPushNotification(
  subscription: StoredPushSubscription,
  payload: PushNotificationPayload,
) {
  configureWebPush();

  const topic = buildPushTopic(payload.tag);

  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    JSON.stringify(payload),
    {
      TTL: PUSH_TTL_SECONDS,
      urgency: "high",
      ...(topic ? { topic } : {}),
    },
  );
}

export function isStalePushSubscriptionError(error: unknown) {
  return (
    typeof error === "object"
    && error !== null
    && "statusCode" in error
    && (error.statusCode === 404 || error.statusCode === 410)
  );
}
