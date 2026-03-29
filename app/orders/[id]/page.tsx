import { OrderStatusView } from "@/components/order-status-view";

type OrderStatusPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ access?: string }>;
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
