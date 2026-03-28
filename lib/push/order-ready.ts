import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  isStalePushSubscriptionError,
  sendWebPushNotification,
  type StoredPushSubscription,
} from "@/lib/push/web-push";

type ReadyTriggerSource = "admin_order_status_patch";

type OrderReadyRow = {
  id: string;
  customer_id: string | null;
  status: string | null;
  order_status: string | null;
  updated_at: string;
};

type PushSubscriptionRow = StoredPushSubscription;

export type OrderReadyPushResult = {
  duplicate: boolean;
  orderId: string;
  orderUrl: string;
  subscriptionCount: number;
  successCount: number;
  staleSubscriptionCount: number;
};

class PushTriggerError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isReadyOrder(row: Pick<OrderReadyRow, "status" | "order_status">) {
  return (
    normalizeStatus(row.status) === "ready"
    || normalizeStatus(row.order_status) === "ready"
    || normalizeStatus(row.order_status) === "ready_for_pickup"
  );
}

function buildOrderUrl(order: Pick<OrderReadyRow, "id" | "customer_id">) {
  if (order.customer_id) {
    return "/account/orders";
  }

  return `/payment/result?orderId=${encodeURIComponent(order.id)}`;
}

async function getOrderForReadyPush(orderId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id,customer_id,status,order_status,updated_at")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load order for push dispatch: ${error.message}`);
  }

  return (data as OrderReadyRow | null) ?? null;
}

async function getOrderLinkedSubscriptionIds(orderId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("push_subscription_orders")
    .select("subscription_id")
    .eq("order_id", orderId);

  if (error) {
    throw new Error(`Unable to load order-linked push subscriptions: ${error.message}`);
  }

  return ((data ?? []) as Array<{ subscription_id: string }>).map((row) => row.subscription_id);
}

async function getSubscriptionsByIds(subscriptionIds: string[]) {
  if (subscriptionIds.length === 0) {
    return [] as PushSubscriptionRow[];
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,user_id,platform,user_agent")
    .in("id", subscriptionIds);

  if (error) {
    throw new Error(`Unable to load push subscriptions by id: ${error.message}`);
  }

  return (data as PushSubscriptionRow[] | null) ?? [];
}

async function getSubscriptionsByUserId(userId: string | null) {
  if (!userId) {
    return [] as PushSubscriptionRow[];
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,user_id,platform,user_agent")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Unable to load user push subscriptions: ${error.message}`);
  }

  return (data as PushSubscriptionRow[] | null) ?? [];
}

function dedupeSubscriptions(subscriptions: PushSubscriptionRow[]) {
  return [...new Map(subscriptions.map((subscription) => [subscription.endpoint, subscription])).values()];
}

async function deletePushSubscriptions(subscriptionIds: string[]) {
  if (subscriptionIds.length === 0) {
    return;
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .in("id", subscriptionIds);

  if (error) {
    throw new Error(`Unable to delete stale push subscriptions: ${error.message}`);
  }
}

async function claimPushDispatch(input: {
  idempotencyKey: string;
  orderId: string;
  orderUpdatedAt: string;
  source: ReadyTriggerSource;
}) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("push_notification_dispatches")
    .insert({
      idempotency_key: input.idempotencyKey,
      notification_type: "order_ready",
      order_id: input.orderId,
      order_updated_at: input.orderUpdatedAt,
      source: input.source,
    });

  if (!error) {
    return "claimed" as const;
  }

  if (error.code === "23505") {
    return "duplicate" as const;
  }

  throw new Error(`Unable to claim push dispatch idempotency key: ${error.message}`);
}

async function completePushDispatch(input: {
  idempotencyKey: string;
  subscriptionCount: number;
  successCount: number;
  staleSubscriptionCount: number;
}) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("push_notification_dispatches")
    .update({
      completed_at: new Date().toISOString(),
      subscription_count: input.subscriptionCount,
      success_count: input.successCount,
      stale_subscription_count: input.staleSubscriptionCount,
    })
    .eq("idempotency_key", input.idempotencyKey);

  if (error) {
    throw new Error(`Unable to complete push dispatch: ${error.message}`);
  }
}

async function releasePushDispatch(idempotencyKey: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("push_notification_dispatches")
    .delete()
    .eq("idempotency_key", idempotencyKey)
    .is("completed_at", null);

  if (error) {
    throw new Error(`Unable to release incomplete push dispatch: ${error.message}`);
  }
}

async function resolveSubscriptionsForOrder(order: Pick<OrderReadyRow, "id" | "customer_id">) {
  const [orderLinkedIds, userSubscriptions] = await Promise.all([
    getOrderLinkedSubscriptionIds(order.id),
    getSubscriptionsByUserId(order.customer_id),
  ]);
  const orderLinkedSubscriptions = await getSubscriptionsByIds(orderLinkedIds);

  return dedupeSubscriptions([
    ...userSubscriptions,
    ...orderLinkedSubscriptions,
  ]);
}

export async function triggerOrderReadyPush(input: {
  idempotencyKey: string;
  orderId: string;
  orderUpdatedAt: string;
  source: ReadyTriggerSource;
}): Promise<OrderReadyPushResult> {
  const claimResult = await claimPushDispatch(input);
  if (claimResult === "duplicate") {
    return {
      duplicate: true,
      orderId: input.orderId,
      orderUrl: `/payment/result?orderId=${encodeURIComponent(input.orderId)}`,
      subscriptionCount: 0,
      successCount: 0,
      staleSubscriptionCount: 0,
    };
  }

  try {
    const order = await getOrderForReadyPush(input.orderId);
    if (!order) {
      throw new PushTriggerError(404, "Order not found.");
    }

    if (!isReadyOrder(order)) {
      throw new PushTriggerError(409, "Order is not in Ready status.");
    }

    if (order.updated_at !== input.orderUpdatedAt) {
      throw new PushTriggerError(409, "Order updated_at does not match the Ready transition.");
    }

    const subscriptions = await resolveSubscriptionsForOrder(order);
    const orderUrl = buildOrderUrl(order);
    const payload = {
      title: "Order Ready",
      body: "Your Kira Bakery order is ready.",
      url: orderUrl,
      tag: `order-ready:${order.id}`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: {
        orderId: order.id,
        url: orderUrl,
      },
    } as const;

    const deliveryResults = await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await sendWebPushNotification(subscription, payload);
          return {
            success: true,
            staleSubscriptionId: null as string | null,
          };
        } catch (error) {
          if (isStalePushSubscriptionError(error)) {
            return {
              success: false,
              staleSubscriptionId: subscription.id,
            };
          }

          console.error("order_ready_push_send_failed", {
            orderId: order.id,
            subscriptionId: subscription.id,
            endpoint: subscription.endpoint,
            error: error instanceof Error ? error.message : "unknown_error",
          });

          return {
            success: false,
            staleSubscriptionId: null as string | null,
          };
        }
      }),
    );
    const successCount = deliveryResults.filter((result) => result.success).length;
    const staleSubscriptionIds = deliveryResults
      .map((result) => result.staleSubscriptionId)
      .filter((subscriptionId): subscriptionId is string => Boolean(subscriptionId));

    await deletePushSubscriptions(staleSubscriptionIds);
    await completePushDispatch({
      idempotencyKey: input.idempotencyKey,
      subscriptionCount: subscriptions.length,
      successCount,
      staleSubscriptionCount: staleSubscriptionIds.length,
    });

    return {
      duplicate: false,
      orderId: order.id,
      orderUrl,
      subscriptionCount: subscriptions.length,
      successCount,
      staleSubscriptionCount: staleSubscriptionIds.length,
    };
  } catch (error) {
    await releasePushDispatch(input.idempotencyKey);
    throw error;
  }
}

export function toPushTriggerResponseStatus(error: unknown) {
  if (error instanceof PushTriggerError) {
    return error.status;
  }

  return 500;
}

export function toPushTriggerResponseMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to trigger order ready push notification.";
}
