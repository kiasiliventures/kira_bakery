import type { Metadata } from "next";
import { OrderStatusView } from "@/components/order-status-view";

type OrderStatusPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ access?: string }>;
};

export const metadata: Metadata = {
  title: "Order Status",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OrderStatusPage({
  params,
  searchParams,
}: OrderStatusPageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  return (
    <OrderStatusView
      orderId={id}
      orderAccessLinkToken={resolvedSearchParams.access?.trim() || null}
    />
  );
}
