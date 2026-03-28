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

export async function sendWebPushNotification(
  subscription: StoredPushSubscription,
  payload: PushNotificationPayload,
) {
  configureWebPush();

  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    JSON.stringify(payload),
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
