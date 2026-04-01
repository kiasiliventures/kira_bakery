"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { urlBase64ToUint8Array } from "@/lib/push/vapid";

type EnableOrderNotificationsProps = {
  orderId: string;
};

type LinkState = "idle" | "checking" | "linking" | "linked" | "needs_permission" | "error";
type SupportedPermissionState = NotificationPermission | "unsupported";

type PushSubscriptionWithJson = PushSubscription & {
  toJSON(): PushSubscriptionJSON;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as NavigatorWithStandalone).standalone === true
  );
}

function getSupportedState() {
  return (
    typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window
  );
}

function getPermissionState(): SupportedPermissionState {
  if (!getSupportedState()) {
    return "unsupported";
  }

  return Notification.permission;
}

function buildSubscribePayload(orderId: string, subscription: PushSubscriptionWithJson) {
  return {
    ...subscription.toJSON(),
    orderId,
  };
}

function logNotificationError(event: string, orderId: string, error: unknown) {
  console.error(event, {
    orderId,
    error: error instanceof Error ? error.message : "unknown_error",
  });
}

async function ensureServiceWorkerRegistration() {
  const existingRegistration = await navigator.serviceWorker.getRegistration();
  const registration = existingRegistration
    ?? await navigator.serviceWorker.register("/sw.js", {
      updateViaCache: "none",
    });

  await navigator.serviceWorker.ready;

  return registration;
}

async function linkSubscriptionToOrder(orderId: string, subscription: PushSubscriptionWithJson) {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildSubscribePayload(orderId, subscription)),
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Unable to link notifications to this order.");
  }
}

export function EnableOrderNotifications({
  orderId,
}: EnableOrderNotificationsProps) {
  const [linkState, setLinkState] = useState<LinkState>("idle");
  const [permissionState, setPermissionState] = useState<SupportedPermissionState>(() =>
    getPermissionState(),
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function autoLinkExistingSubscription() {
      const nextPermissionState = getPermissionState();
      if (cancelled) {
        return;
      }

      setPermissionState(nextPermissionState);

      if (nextPermissionState === "unsupported") {
        setLinkState("error");
        setMessage("This device or browser does not support web push notifications.");
        return;
      }

      setLinkState("checking");
      setMessage(null);

      if (nextPermissionState !== "granted") {
        if (!cancelled) {
          setLinkState("needs_permission");
        }
        return;
      }

      try {
        const registration = await ensureServiceWorkerRegistration();
        const existingSubscription = await registration.pushManager.getSubscription();

        if (!existingSubscription) {
          if (!cancelled) {
            setLinkState("error");
            setMessage(
              "Notifications are allowed in this browser, but this order is not linked yet. Retry to finish linking it.",
            );
          }
          return;
        }

        // Successive guest orders need a fresh order link even when the browser already
        // has a valid PushSubscription from a previous order.
        if (!cancelled) {
          setLinkState("linking");
          setMessage("Linking this browser to your current order notifications...");
        }

        await linkSubscriptionToOrder(orderId, existingSubscription as PushSubscriptionWithJson);

        if (!cancelled) {
          setLinkState("linked");
          setMessage(null);
        }
      } catch (error) {
        logNotificationError("order_notification_auto_link_failed", orderId, error);

        if (!cancelled) {
          setLinkState("error");
          setMessage(
            error instanceof Error
              ? error.message
              : "We couldn't link notifications to this order. Retry to keep order-ready alerts working.",
          );
        }
      }
    }

    void autoLinkExistingSubscription();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function handleEnableNotifications() {
    const nextPermissionState = getPermissionState();
    setPermissionState(nextPermissionState);

    if (nextPermissionState === "unsupported") {
      setLinkState("error");
      setMessage("This device or browser does not support web push notifications.");
      return;
    }

    if (isIosDevice() && !isStandaloneMode()) {
      setLinkState("error");
      setMessage("On iPhone, install KiRA Bakery to your Home Screen before enabling notifications.");
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (!vapidPublicKey) {
      setLinkState("error");
      setMessage("Push notifications are not configured yet. Please try again later.");
      return;
    }

    setLinkState("linking");
    setMessage("Linking notifications to this order...");

    try {
      const permission = nextPermissionState === "granted"
        ? nextPermissionState
        : await Notification.requestPermission();

      setPermissionState(permission);

      if (permission !== "granted") {
        setLinkState("needs_permission");
        setMessage(
          permission === "denied"
            ? "Notifications are blocked in this browser. Update your browser settings to turn them on."
            : "Notification permission was dismissed. Tap the button again if you'd like to enable it.",
        );
        return;
      }

      const registration = await ensureServiceWorkerRegistration();
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

      await linkSubscriptionToOrder(orderId, subscription as PushSubscriptionWithJson);

      setLinkState("linked");
      setMessage(null);
    } catch (error) {
      logNotificationError("order_notification_link_failed", orderId, error);
      setLinkState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to enable notifications right now.",
      );
    }
  }

  if (linkState === "linked") {
    return null;
  }

  const isBusy = linkState === "checking" || linkState === "linking";
  const actionLabel = permissionState === "granted" && linkState === "error"
    ? "Retry linking notifications"
    : "Enable notifications";

  return (
    <Card className="rounded-[28px] border border-border/60 bg-surface-alt/40 shadow-[var(--shadow-soft)]">
      <CardHeader className="gap-2 p-8 pb-4">
        <CardTitle className="font-serif text-2xl text-foreground">
          Get notified when your order is ready
        </CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-6 text-muted">
          Turn on notifications and we&apos;ll alert you as soon as your order is ready for pickup
          or delivery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-8 pt-0">
        {!isBusy && (
          <Button
            type="button"
            onClick={() => {
              void handleEnableNotifications();
            }}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
          >
            {actionLabel}
          </Button>
        )}
        {isBusy && (
          <Button
            type="button"
            loading
            disabled
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
          >
            {linkState === "checking" ? "Checking notifications" : "Linking notifications"}
          </Button>
        )}
        {message && <p className="text-sm text-muted">{message}</p>}
      </CardContent>
    </Card>
  );
}
