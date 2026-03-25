import "server-only";

import { getSupabaseAuthServerClient } from "@/lib/supabase/server";
import {
  formatPaymentStatusLabel,
  normalizeOrderStatusLabel,
  type CanonicalOrderStatus,
} from "@/lib/orders/status";

type CustomerOrderItemRow = {
  name: string;
  image: string;
  price_ugx: number;
  quantity: number;
  selected_size: string | null;
  selected_flavor: string | null;
};

type CustomerOrderRow = {
  id: string;
  customer_name: string;
  delivery_method: "delivery" | "pickup" | null;
  total_ugx: number;
  status: string | null;
  order_status: string | null;
  payment_status: string | null;
  created_at: string;
  order_items: CustomerOrderItemRow[] | null;
};

export type CustomerOrderSummary = {
  id: string;
  customerName: string;
  deliveryMethod: "delivery" | "pickup" | null;
  totalUGX: number;
  status: CanonicalOrderStatus;
  paymentStatusLabel: string;
  createdAt: string;
  items: Array<{
    name: string;
    image: string;
    priceUGX: number;
    quantity: number;
    selectedSize: string | null;
    selectedFlavor: string | null;
  }>;
};

const orderSelection = [
  "id",
  "customer_name",
  "delivery_method",
  "total_ugx",
  "status",
  "order_status",
  "payment_status",
  "created_at",
  "order_items(name,image,price_ugx,quantity,selected_size,selected_flavor)",
].join(",");

export async function getCustomerOrders(customerId: string): Promise<CustomerOrderSummary[]> {
  const supabase = await getSupabaseAuthServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelection)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Unable to load customer orders: ${error.message}`);
  }

  return ((data ?? []) as unknown as CustomerOrderRow[]).map((order) => ({
    id: order.id,
    customerName: order.customer_name,
    deliveryMethod: order.delivery_method,
    totalUGX: order.total_ugx,
    status: normalizeOrderStatusLabel(order.status ?? order.order_status, order.payment_status),
    paymentStatusLabel: formatPaymentStatusLabel(order.payment_status),
    createdAt: order.created_at,
    items: (order.order_items ?? []).map((item) => ({
      name: item.name,
      image: item.image,
      priceUGX: item.price_ugx,
      quantity: item.quantity,
      selectedSize: item.selected_size,
      selectedFlavor: item.selected_flavor,
    })),
  }));
}
