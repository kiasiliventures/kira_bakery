import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUserMock = vi.fn();
const getCustomerOrdersMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUser: getAuthenticatedUserMock,
}));

vi.mock("@/lib/orders/customer-orders", () => ({
  getCustomerOrders: getCustomerOrdersMock,
}));

describe("account orders route", () => {
  beforeEach(() => {
    getAuthenticatedUserMock.mockReset();
    getCustomerOrdersMock.mockReset();
  });

  it("rejects unauthenticated access", async () => {
    getAuthenticatedUserMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/account/orders/route");
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "You must be signed in to view your orders.",
    });
    expect(getCustomerOrdersMock).not.toHaveBeenCalled();
  });

  it("returns only the authenticated customer's orders", async () => {
    getAuthenticatedUserMock.mockResolvedValue({
      id: "customer-123",
      email: "customer@example.com",
    });
    getCustomerOrdersMock.mockResolvedValue([
      {
        id: "order-1",
        status: "Paid",
      },
    ]);

    const { GET } = await import("@/app/api/account/orders/route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      orders: [
        {
          id: "order-1",
          status: "Paid",
        },
      ],
    });
    expect(getCustomerOrdersMock).toHaveBeenCalledWith("customer-123");
  });
});
