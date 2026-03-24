import { beforeEach, describe, expect, it, vi } from "vitest";

const getPaymentGatewayMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();
const logSecurityEventMock = vi.fn();

vi.mock("@/lib/payments/gateway", () => ({
  getPaymentGateway: getPaymentGatewayMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

vi.mock("@/lib/observability/security-events", () => ({
  logSecurityEvent: logSecurityEventMock,
}));

type MockOrderRow = {
  id: string;
  order_access_token: string;
  total_ugx: number;
  total_price: number | null;
  status: string;
  order_status: string | null;
  customer_name: string;
  customer_phone: string | null;
  phone: string | null;
  customer_email: string | null;
  email: string | null;
  payment_status: string | null;
  payment_provider: string | null;
  payment_reference: string | null;
  payment_redirect_url: string | null;
  paid_at: string | null;
  order_tracking_id: string | null;
  created_at: string;
  order_items: [];
};

function buildSupabaseClient(orderRow: MockOrderRow) {
  const updateSpy = vi.fn();
  const upsertSpy = vi.fn(async () => ({ error: null }));

  return {
    updateSpy,
    upsertSpy,
    client: {
      from(table: string) {
        if (table === "orders") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: orderRow,
                      error: null,
                    }),
                  };
                },
              };
            },
            update(values: unknown) {
              updateSpy(values);
              return {
                eq: async () => ({
                  error: null,
                }),
              };
            },
          };
        }

        if (table === "payment_attempts") {
          return {
            upsert: upsertSpy,
          };
        }

        throw new Error(`Unexpected table access in test: ${table}`);
      },
    },
  };
}

describe("payment sync regression tests", () => {
  beforeEach(() => {
    getPaymentGatewayMock.mockReset();
    getSupabaseServerClientMock.mockReset();
    logSecurityEventMock.mockReset();
  });

  it("rejects paid statuses when the provider amount does not match the stored order amount", async () => {
    const orderRow: MockOrderRow = {
      id: "4ecf46c0-17fe-4fba-8fe2-6b58a4c3409f",
      order_access_token: "access-token",
      total_ugx: 120000,
      total_price: 120000,
      status: "Pending",
      order_status: "pending",
      customer_name: "Jane Doe",
      customer_phone: "+256700000000",
      phone: "+256700000000",
      customer_email: "jane@example.com",
      email: "jane@example.com",
      payment_status: "pending",
      payment_provider: "pesapal",
      payment_reference: null,
      payment_redirect_url: "https://payments.example.com",
      paid_at: null,
      order_tracking_id: "tracking-123",
      created_at: new Date().toISOString(),
      order_items: [],
    };

    const supabase = buildSupabaseClient(orderRow);
    getSupabaseServerClientMock.mockReturnValue(supabase.client);
    getPaymentGatewayMock.mockReturnValue({
      verifyPayment: vi.fn().mockResolvedValue({
        provider: "pesapal",
        providerReference: "tracking-123",
        paymentStatus: "paid",
        providerStatus: "COMPLETED",
        paymentReference: "ref-123",
        amount: 50000,
        currency: "UGX",
        rawResponse: { ok: true },
        verifiedAt: new Date().toISOString(),
      }),
    });

    const { syncOrderPaymentForOrder } = await import("@/lib/payments/order-payments");

    await expect(
      syncOrderPaymentForOrder({
        orderId: orderRow.id,
        orderTrackingId: "tracking-123",
        source: "status",
      }),
    ).rejects.toThrow("Payment amount verification failed. Order held for review.");

    expect(supabase.upsertSpy).toHaveBeenCalledTimes(1);
    expect(supabase.updateSpy).not.toHaveBeenCalled();
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "payment_amount_mismatch",
        severity: "error",
      }),
    );
  });

  it("returns the canonical order_status in the payment snapshot", async () => {
    const orderRow: MockOrderRow = {
      id: "7aa4d2cc-7ba8-4cc0-b856-a7921a4fb7bf",
      order_access_token: "access-token",
      total_ugx: 120000,
      total_price: 120000,
      status: "Pending",
      order_status: "confirmed",
      customer_name: "Jane Doe",
      customer_phone: "+256700000000",
      phone: "+256700000000",
      customer_email: "jane@example.com",
      email: "jane@example.com",
      payment_status: "paid",
      payment_provider: "pesapal",
      payment_reference: null,
      payment_redirect_url: "https://payments.example.com",
      paid_at: null,
      order_tracking_id: "tracking-123",
      created_at: new Date().toISOString(),
      order_items: [],
    };

    const supabase = buildSupabaseClient(orderRow);
    getSupabaseServerClientMock.mockReturnValue(supabase.client);

    const { getOrderPaymentSnapshot } = await import("@/lib/payments/order-payments");

    await expect(getOrderPaymentSnapshot(orderRow.id)).resolves.toEqual(
      expect.objectContaining({
        orderStatus: "confirmed",
        paymentStatus: "paid",
        viewState: "success",
      }),
    );
  });
});
