import { beforeEach, describe, expect, it, vi } from "vitest";

const orderMock = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
};

const fromMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

describe("getCustomerOrders", () => {
  beforeEach(() => {
    orderMock.select.mockReset();
    orderMock.eq.mockReset();
    orderMock.order.mockReset();
    orderMock.limit.mockReset();
    fromMock.mockReset();
    getSupabaseServerClientMock.mockReset();

    orderMock.select.mockReturnValue(orderMock);
    orderMock.eq.mockReturnValue(orderMock);
    orderMock.order.mockReturnValue(orderMock);
    orderMock.limit.mockResolvedValue({
      data: [
        {
          id: "order-1",
          customer_name: "Jane Doe",
          delivery_method: "pickup",
          total_ugx: 120000,
          status: "Pending Payment",
          order_status: "pending_payment",
          payment_status: "pending",
          created_at: "2026-04-14T10:00:00.000Z",
          order_items: [
            {
              name: "Milk Bread",
              image: "/bread.jpg",
              price_ugx: 120000,
              quantity: 1,
              selected_size: null,
              selected_flavor: null,
            },
          ],
        },
      ],
      error: null,
    });

    fromMock.mockReturnValue(orderMock);
    getSupabaseServerClientMock.mockReturnValue({
      from: fromMock,
    });
  });

  it("loads orders through the server client for the authenticated customer id", async () => {
    const { getCustomerOrders } = await import("@/lib/orders/customer-orders");

    const orders = await getCustomerOrders("customer-123");

    expect(getSupabaseServerClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("orders");
    expect(orderMock.eq).toHaveBeenCalledWith("customer_id", "customer-123");
    expect(orders).toEqual([
      expect.objectContaining({
        id: "order-1",
        customerName: "Jane Doe",
        totalUGX: 120000,
      }),
    ]);
  });
});
