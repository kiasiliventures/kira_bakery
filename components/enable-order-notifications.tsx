"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { urlBase64ToUint8Array } from "@/lib/push/vapid";

type EnableOrderNotificationsProps = {
  orderId: string;
};

type RequestState = "idle" | "submitting" | "success" | "error";

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

export function EnableOrderNotifications({
  orderId,
}: EnableOrderNotificationsProps) {
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [hasExistingSubscription, setHasExistingSubscription] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadExistingSubscription() {
      if (!getSupportedState() || Notification.permission !== "granted") {
        if (!cancelled) {
          setHasExistingSubscription(false);
        }
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration() ?? await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();

        if (!cancelled) {
          setHasExistingSubscription(Boolean(existingSubscription));
        }
      } catch {
        if (!cancelled) {
          setHasExistingSubscription(false);
        }
      }
    }

    void loadExistingSubscription();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnableNotifications() {
    if (!getSupportedState()) {
      setRequestState("error");
      setMessage("This device or browser does not support web push notifications.");
      return;
    }

    if (isIosDevice() && !isStandaloneMode()) {
      setRequestState("error");
      setMessage("On iPhone, install KiRA Bakery to your Home Screen before enabling notifications.");
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (!vapidPublicKey) {
      setRequestState("error");
      setMessage("Push notifications are not configured yet. Please try again later.");
      return;
    }

    setRequestState("submitting");
    setMessage(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setRequestState("error");
        setMessage(
          permission === "denied"
            ? "Notifications are blocked in this browser. Update your browser settings to turn them on."
            : "Notification permission was dismissed. Tap the button again if you'd like to enable it.",
        );
        return;
      }

      const existingRegistration = await navigator.serviceWorker.getRegistration();
      const registration = existingRegistration
        ?? await navigator.serviceWorker.register("/sw.js");

      await navigator.serviceWorker.ready;

      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...subscription.toJSON(),
          orderId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to save your notification subscription.");
      }

      setRequestState("success");
      setHasExistingSubscription(true);
      setMessage("Notifications are enabled. We'll alert you as soon as your order is ready.");
    } catch (error) {
      setRequestState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to enable notifications right now.",
      );
    }
  }

  if (hasExistingSubscription && requestState !== "success") {
    return null;
  }

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
        <Button
          type="button"
          onClick={() => {
            void handleEnableNotifications();
          }}
          loading={requestState === "submitting"}
          disabled={requestState === "success"}
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
        >
          {requestState === "success" ? "Notifications enabled" : "Enable notifications"}
        </Button>
        {message && (
          <p
            className={
              requestState === "success"
                ? "text-sm text-emerald-700"
                : "text-sm text-muted"
            }
          >
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
