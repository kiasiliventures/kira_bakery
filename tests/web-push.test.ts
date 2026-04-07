import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendNotificationMock, setVapidDetailsMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(),
  setVapidDetailsMock: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    sendNotification: sendNotificationMock,
    setVapidDetails: setVapidDetailsMock,
  },
}));

import {
  sendWebPushNotification,
  type StoredPushSubscription,
} from "@/lib/push/web-push";

describe("sendWebPushNotification", () => {
  const subscription: StoredPushSubscription = {
    id: "sub-1",
    endpoint: "https://push.example.com/sub-1",
    p256dh: "p256dh-key",
    auth: "auth-key",
    user_id: null,
    platform: "android",
    user_agent: "test-agent",
  };

  beforeEach(() => {
    sendNotificationMock.mockReset();
    setVapidDetailsMock.mockReset();
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-key";
    process.env.VAPID_PRIVATE_KEY = "private-key";
  });

  it("sends order-ready pushes with explicit delivery hints", async () => {
    sendNotificationMock.mockResolvedValue(undefined);

    await sendWebPushNotification(subscription, {
      title: "Order Ready",
      body: "Your order is ready.",
      url: "/orders/test-order",
      tag: "order-ready:test-order-123",
    });

    expect(setVapidDetailsMock).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "public-key",
      "private-key",
    );
    expect(sendNotificationMock).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example.com/sub-1",
        keys: {
          p256dh: "p256dh-key",
          auth: "auth-key",
        },
      },
      JSON.stringify({
        title: "Order Ready",
        body: "Your order is ready.",
        url: "/orders/test-order",
        tag: "order-ready:test-order-123",
      }),
      {
        TTL: 300,
        urgency: "high",
        topic: "order-readytest-order-123",
      },
    );
  });
});
