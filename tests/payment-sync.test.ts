import { beforeEach, describe, expect, it, vi } from "vitest";

const getPaymentGatewayMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();
const logSecurityEventMock = vi.fn();
const triggerAdminPaidOrderPushDispatchMock = vi.fn();

vi.mock("@/lib/payments/gateway", () => ({
  getPaymentGateway: getPaymentGatewayMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

vi.mock("@/lib/observability/security-events", () => ({
  logSecurityEvent: logSecurityEventMock,
}));

vi.mock("@/lib/push/admin-paid-order", () => ({
  triggerAdminPaidOrderPushDispatch: triggerAdminPaidOrderPushDispatchMock,
}));

type MockOrderItemRow = {
  name: string;
  quantity: number;
  selected_size: string | null;
  selected_flavor: string | null;
};

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
  payment_initiation_failure_code: string | null;
  payment_initiation_failure_message: string | null;
  payment_initiation_failed_at: string | null;
  payment_initiation_attempted_at: string | null;
  paid_at: string | null;
  order_tracking_id: string | null;
  fulfillment_review_required: boolean | null;
  fulfillment_review_reason: string | null;
  inventory_conflict: boolean | null;
  inventory_deduction_status: string | null;
  inventory_deduction_attempted_at: string | null;
  created_at: string;
  updated_at: string;
  order_items: MockOrderItemRow[];
};

type PaymentSupabaseHarness = {
  client: {
    from: (table: string) => unknown;
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  getOrderRow: () => MockOrderRow;
  setOrderRow: (nextOrder: MockOrderRow) => void;
  updateSpy: ReturnType<typeof vi.fn>;
  upsertSpy: ReturnType<typeof vi.fn>;
  rpcSpy: ReturnType<typeof vi.fn>;
};

function createOrderRow(overrides: Partial<MockOrderRow> = {}): MockOrderRow {
  return {
    id: "4ecf46c0-17fe-4fba-8fe2-6b58a4c3409f",
    order_access_token: "access-token",
    total_ugx: 120000,
    total_price: 120000,
    status: "Pending Payment",
    order_status: "pending_payment",
    customer_name: "Jane Doe",
    customer_phone: "+256700000000",
    phone: "+256700000000",
    customer_email: "jane@example.com",
    email: "jane@example.com",
    payment_status: "pending",
    payment_provider: "pesapal",
    payment_reference: null,
    payment_redirect_url: "https://payments.example.com",
    payment_initiation_failure_code: null,
    payment_initiation_failure_message: null,
    payment_initiation_failed_at: null,
    payment_initiation_attempted_at: null,
    paid_at: null,
    order_tracking_id: "tracking-123",
    fulfillment_review_required: false,
    fulfillment_review_reason: null,
    inventory_conflict: false,
    inventory_deduction_status: "not_started",
    inventory_deduction_attempted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    order_items: [],
    ...overrides,
  };
}

function cloneOrderRow(row: MockOrderRow): MockOrderRow {
  return structuredClone(row);
}

function buildSupabaseHarness(
  initialOrderRow: MockOrderRow,
  options?: {
    onRpc?: (
      name: string,
      args: Record<string, unknown>,
      state: { orderRow: MockOrderRow },
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
): PaymentSupabaseHarness {
  const state = {
    orderRow: cloneOrderRow(initialOrderRow),
  };
  const getFieldValue = (row: MockOrderRow, field: string) =>
    row[field as keyof MockOrderRow];
  const matchesOrFilter = (row: MockOrderRow, filter: string) =>
    filter.split(",").some((entry) => {
      const [field, operator, ...valueParts] = entry.split(".");
      const expected = valueParts.join(".");
      const actual = getFieldValue(row, field);

      if (operator === "is" && expected === "null") {
        return actual == null;
      }

      if (operator === "eq") {
        return String(actual ?? "") === expected;
      }

      return false;
    });
  const matchesNotFilter = (
    row: MockOrderRow,
    field: string,
    operator: string,
    value: unknown,
  ) => {
    const actual = getFieldValue(row, field);

    if (operator === "in" && typeof value === "string") {
      const normalizedValues = value
        .replace(/^\(/, "")
        .replace(/\)$/, "")
        .split(",")
        .map((entry) => entry.trim());

      return !normalizedValues.includes(String(actual ?? ""));
    }

    return true;
  };
  const updateSpy = vi.fn();
  const upsertSpy = vi.fn(async () => ({ error: null }));
  const rpcSpy = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (options?.onRpc) {
      return options.onRpc(name, args, state);
    }

    return { data: null, error: null };
  });

  const client = {
    from(table: string) {
      if (table === "orders") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: cloneOrderRow(state.orderRow),
                    error: null,
                  }),
                };
              },
            };
          },
          update(values: Partial<MockOrderRow>) {
            updateSpy(values);
            const eqFilters = new Map<string, unknown>();
            const isFilters = new Map<string, unknown>();
            const inFilters = new Map<string, unknown[]>();
            const orFilters: string[] = [];
            const notFilters: Array<{ field: string; operator: string; value: unknown }> = [];

            const query = {
              eq(field: string, value: unknown) {
                eqFilters.set(field, value);
                return query;
              },
              is(field: string, value: unknown) {
                isFilters.set(field, value);
                return query;
              },
              in(field: string, values: unknown[]) {
                inFilters.set(field, values);
                return query;
              },
              or(filter: string) {
                orFilters.push(filter);
                return query;
              },
              not(field: string, operator: string, value: unknown) {
                notFilters.push({ field, operator, value });
                return query;
              },
              select() {
                return {
                  maybeSingle: async () => {
                    const matchesEq = [...eqFilters.entries()].every(([field, value]) =>
                      getFieldValue(state.orderRow, field) === value,
                    );
                    const matchesIs = [...isFilters.entries()].every(([field, value]) =>
                      getFieldValue(state.orderRow, field) === value,
                    );
                    const matchesIn = [...inFilters.entries()].every(([field, values]) =>
                      values.includes(getFieldValue(state.orderRow, field)),
                    );
                    const matchesOr = orFilters.every((filter) =>
                      matchesOrFilter(state.orderRow, filter),
                    );
                    const matchesNot = notFilters.every((filter) =>
                      matchesNotFilter(state.orderRow, filter.field, filter.operator, filter.value),
                    );

                    if (!(matchesEq && matchesIs && matchesIn && matchesOr && matchesNot)) {
                      return {
                        data: null,
                        error: null,
                      };
                    }

                    state.orderRow = {
                      ...state.orderRow,
                      ...values,
                    };

                    return {
                      data: cloneOrderRow(state.orderRow),
                      error: null,
                    };
                  },
                };
              },
            };

            return query;
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
    rpc(name: string, args: Record<string, unknown>) {
      return rpcSpy(name, args);
    },
  };

  return {
    client,
    getOrderRow: () => cloneOrderRow(state.orderRow),
    setOrderRow: (nextOrder) => {
      state.orderRow = cloneOrderRow(nextOrder);
    },
    updateSpy,
    upsertSpy,
    rpcSpy,
  };
}

describe("payment sync regression tests", () => {
  beforeEach(() => {
    vi.resetModules();
    getPaymentGatewayMock.mockReset();
    getSupabaseServerClientMock.mockReset();
    logSecurityEventMock.mockReset();
    triggerAdminPaidOrderPushDispatchMock.mockReset();
  });

  it("rejects paid statuses when the provider amount does not match the stored order amount", async () => {
    const orderRow = createOrderRow();
    const supabase = buildSupabaseHarness(orderRow);

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
    expect(supabase.updateSpy).toHaveBeenCalledTimes(1);
    expect(supabase.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_last_verified_at: expect.any(String),
      }),
    );
    expect(supabase.rpcSpy).not.toHaveBeenCalled();
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "payment_amount_mismatch",
        severity: "error",
      }),
    );
  });

  it("cancels a rejected initiation even when the order has not stored a provider yet", async () => {
    const orderRow = createOrderRow({
      payment_provider: null,
      payment_status: "unpaid",
      payment_redirect_url: null,
      order_tracking_id: null,
    });
    const supabase = buildSupabaseHarness(orderRow);

    getSupabaseServerClientMock.mockReturnValue(supabase.client);

    const { cancelRejectedOrderPaymentInitiation } = await import("@/lib/payments/order-payments");
    const result = await cancelRejectedOrderPaymentInitiation({
      orderId: orderRow.id,
      provider: "pesapal",
      reasonCode: "maximum_amount_limit_exceeded",
      reasonMessage: "Request Declined.Maximum allowed test transactions limit exceeded",
    });

    expect(result).toEqual(
      expect.objectContaining({
        orderId: orderRow.id,
        paymentStatus: "cancelled",
        viewState: "cancelled",
      }),
    );
    expect(supabase.getOrderRow()).toEqual(
      expect.objectContaining({
        status: "Cancelled",
        order_status: "cancelled",
        payment_status: "cancelled",
        payment_provider: "pesapal",
        payment_initiation_failure_code: "maximum_amount_limit_exceeded",
        payment_initiation_failure_message:
          "Request Declined.Maximum allowed test transactions limit exceeded",
      }),
    );
  });

  it("cancels a rejected guest-checkout initiation when the raw legacy status is still Pending", async () => {
    const orderRow = createOrderRow({
      status: "Pending",
      order_status: "pending",
      payment_provider: "pesapal",
      payment_status: "unpaid",
      payment_redirect_url: null,
      order_tracking_id: null,
    });
    const supabase = buildSupabaseHarness(orderRow);

    getSupabaseServerClientMock.mockReturnValue(supabase.client);

    const { cancelRejectedOrderPaymentInitiation } = await import("@/lib/payments/order-payments");
    const result = await cancelRejectedOrderPaymentInitiation({
      orderId: orderRow.id,
      provider: "pesapal",
      reasonCode: "maximum_amount_limit_exceeded",
      reasonMessage: "Request Declined.Maximum allowed test transactions limit exceeded",
    });

    expect(result).toEqual(
      expect.objectContaining({
        orderId: orderRow.id,
        paymentStatus: "cancelled",
        viewState: "cancelled",
      }),
    );
    expect(supabase.getOrderRow()).toEqual(
      expect.objectContaining({
        status: "Cancelled",
        order_status: "cancelled",
        payment_status: "cancelled",
      }),
    );
  });

  it("releases a stale initiation claim and retries payment initiation", async () => {
    const orderRow = createOrderRow({
      payment_status: "pending",
      payment_redirect_url: null,
      order_tracking_id: null,
      payment_initiation_attempted_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    const supabase = buildSupabaseHarness(orderRow);
    const initiatePaymentMock = vi.fn().mockResolvedValue({
      provider: "pesapal",
      providerReference: "tracking-456",
      paymentStatus: "pending",
      redirectUrl: "https://payments.example.com/retry",
      rawResponse: { ok: true },
    });

    getSupabaseServerClientMock.mockReturnValue(supabase.client);
    getPaymentGatewayMock.mockReturnValue({
      initiatePayment: initiatePaymentMock,
    });

    const { initiateOrderPaymentForOrder } = await import("@/lib/payments/order-payments");
    const result = await initiateOrderPaymentForOrder(orderRow.id, {
      requestOrigin: "https://kirabakery.com",
    });

    expect(result).toEqual({
      orderId: orderRow.id,
      redirectUrl: "https://payments.example.com/retry",
      paymentStatus: "pending",
    });
    expect(initiatePaymentMock).toHaveBeenCalledTimes(1);
    expect(supabase.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_initiation_attempted_at: null,
      }),
    );
    expect(supabase.getOrderRow()).toEqual(
      expect.objectContaining({
        order_tracking_id: "tracking-456",
        payment_redirect_url: "https://payments.example.com/retry",
        payment_status: "pending",
      }),
    );
  });

  it("reconciles tracked pending orders independently of the admin dashboard", async () => {
    const pendingOrder = createOrderRow({
      id: "outside-dashboard-order",
      payment_redirect_url: null,
      order_tracking_id: "tracking-outside-dashboard",
      payment_last_verified_at: null,
      created_at: "2026-04-07T10:00:00.000Z",
      updated_at: "2026-04-07T10:00:00.000Z",
    });
    const latestOrder = createOrderRow({
      id: pendingOrder.id,
      payment_redirect_url: null,
      order_tracking_id: pendingOrder.order_tracking_id,
      payment_status: "paid",
      status: "Paid",
      order_status: "paid",
      created_at: pendingOrder.created_at,
      updated_at: "2026-04-07T10:06:00.000Z",
    });
    const listOrders = vi.fn().mockResolvedValue([pendingOrder]);
    const verifyOrder = vi.fn().mockResolvedValue({
      ok: true,
      orderId: pendingOrder.id,
      provider: "pesapal",
      verificationState: "paid",
      providerStatus: "COMPLETED",
      stickyPaid: false,
      wasAlreadyPaid: false,
      isNowPaid: true,
      justBecamePaid: true,
      amountExpected: 120000,
      amountReceived: 120000,
      currency: "UGX",
      providerTrackingId: pendingOrder.order_tracking_id,
      merchantReference: pendingOrder.id,
      paymentReference: "ref-123",
      updated: true,
      orderSnapshot: {
        orderId: pendingOrder.id,
        customerName: pendingOrder.customer_name,
        orderStatus: "Paid",
        totalUGX: pendingOrder.total_ugx,
        paymentStatus: "paid",
        viewState: "success",
        verified: true,
        items: [],
      },
      message: "Payment verified successfully.",
    });
    const getLatestOrder = vi.fn().mockResolvedValue(latestOrder);

    const { reconcileDuePendingTrackedPayments } = await import("@/lib/payments/order-payments");
    const stats = await reconcileDuePendingTrackedPayments("test_recovery", {
      now: new Date("2026-04-07T10:20:00.000Z"),
      listOrders,
      verifyOrder,
      getLatestOrder,
    });

    expect(listOrders).toHaveBeenCalledTimes(1);
    expect(verifyOrder).toHaveBeenCalledWith(expect.objectContaining({ id: pendingOrder.id }));
    expect(stats).toEqual(
      expect.objectContaining({
        trigger: "test_recovery",
        scanned: 1,
        verified: 1,
        cancelled: 0,
        errors: 0,
      }),
    );
  });

  it("keeps tracked pending orders open during the 7-minute grace period", async () => {
    const pendingOrder = createOrderRow({
      id: "fresh-pending-order",
      payment_redirect_url: null,
      order_tracking_id: "tracking-fresh-pending",
      created_at: "2026-04-07T09:14:00.000Z",
      updated_at: "2026-04-07T09:14:00.000Z",
    });
    const latestOrder = createOrderRow({
      ...pendingOrder,
      updated_at: "2026-04-07T09:15:00.000Z",
    });
    const verifyOrder = vi.fn().mockResolvedValue({
      ok: true,
      orderId: pendingOrder.id,
      provider: "pesapal",
      verificationState: "pending",
      providerStatus: "INVALID",
      stickyPaid: false,
      wasAlreadyPaid: false,
      isNowPaid: false,
      justBecamePaid: false,
      amountExpected: 120000,
      amountReceived: 120000,
      currency: "UGX",
      providerTrackingId: pendingOrder.order_tracking_id,
      merchantReference: pendingOrder.id,
      paymentReference: null,
      updated: true,
      orderSnapshot: {
        orderId: pendingOrder.id,
        customerName: pendingOrder.customer_name,
        orderStatus: "Pending Payment",
        totalUGX: pendingOrder.total_ugx,
        paymentStatus: "pending",
        viewState: "pending",
        verified: false,
        items: [],
      },
      message: "Payment is still pending.",
    });
    const getLatestOrder = vi.fn().mockResolvedValue(latestOrder);
    const cancelOrder = vi.fn();

    const { reconcileDuePendingTrackedPayments } = await import("@/lib/payments/order-payments");
    const stats = await reconcileDuePendingTrackedPayments("test_recovery", {
      now: new Date("2026-04-07T09:20:00.000Z"),
      listOrders: vi.fn().mockResolvedValue([pendingOrder]),
      verifyOrder,
      getLatestOrder,
      cancelOrder,
    });

    expect(verifyOrder).toHaveBeenCalledTimes(1);
    expect(cancelOrder).not.toHaveBeenCalled();
    expect(stats).toEqual(
      expect.objectContaining({
        verified: 1,
        cancelled: 0,
        errors: 0,
      }),
    );
  });

  it("soft-cancels stale tracked pending orders when reverify still reports pending", async () => {
    const pendingOrder = createOrderRow({
      id: "stale-pending-order",
      payment_redirect_url: null,
      order_tracking_id: "tracking-stale-pending",
      payment_last_verified_at: null,
      created_at: "2026-04-07T09:00:00.000Z",
      updated_at: "2026-04-07T09:00:00.000Z",
    });
    const latestOrder = createOrderRow({
      ...pendingOrder,
      updated_at: "2026-04-07T09:16:00.000Z",
    });
    const cancelledOrder = createOrderRow({
      ...pendingOrder,
      status: "Cancelled",
      order_status: "cancelled",
      payment_status: "cancelled",
      updated_at: "2026-04-07T09:17:00.000Z",
    });
    const verifyOrder = vi.fn().mockResolvedValue({
      ok: true,
      orderId: pendingOrder.id,
      provider: "pesapal",
      verificationState: "pending",
      providerStatus: "PENDING",
      stickyPaid: false,
      wasAlreadyPaid: false,
      isNowPaid: false,
      justBecamePaid: false,
      amountExpected: 120000,
      amountReceived: 120000,
      currency: "UGX",
      providerTrackingId: pendingOrder.order_tracking_id,
      merchantReference: pendingOrder.id,
      paymentReference: null,
      updated: false,
      orderSnapshot: {
        orderId: pendingOrder.id,
        customerName: pendingOrder.customer_name,
        orderStatus: "Pending Payment",
        totalUGX: pendingOrder.total_ugx,
        paymentStatus: "pending",
        viewState: "pending",
        verified: false,
        items: [],
      },
      message: "Payment still pending.",
    });
    const getLatestOrder = vi.fn().mockResolvedValue(latestOrder);
    const cancelOrder = vi.fn().mockResolvedValue(cancelledOrder);

    const { reconcileDuePendingTrackedPayments } = await import("@/lib/payments/order-payments");
    const stats = await reconcileDuePendingTrackedPayments("test_recovery", {
      now: new Date("2026-04-07T09:20:00.000Z"),
      listOrders: vi.fn().mockResolvedValue([pendingOrder]),
      verifyOrder,
      getLatestOrder,
      cancelOrder,
    });

    expect(verifyOrder).toHaveBeenCalledTimes(1);
    expect(cancelOrder).toHaveBeenCalledWith(expect.objectContaining({ id: pendingOrder.id }));
    expect(stats).toEqual(
      expect.objectContaining({
        verified: 1,
        cancelled: 1,
        errors: 0,
      }),
    );
  });

  it("keeps INVALID Pesapal verification results pending instead of cancelling immediately", async () => {
    const orderRow = createOrderRow({
      payment_status: "pending",
      status: "Pending Payment",
      order_status: "pending_payment",
    });
    const verifiedAt = new Date().toISOString();
    const supabase = buildSupabaseHarness(orderRow);

    getSupabaseServerClientMock.mockReturnValue(supabase.client);
    getPaymentGatewayMock.mockReturnValue({
      verifyPayment: vi.fn().mockResolvedValue({
        provider: "pesapal",
        providerReference: "tracking-123",
        paymentStatus: "pending",
        providerStatus: "INVALID",
        paymentReference: null,
        amount: 120000,
        currency: "UGX",
        rawResponse: { payment_status_description: "INVALID" },
        verifiedAt,
      }),
    });

    const { verifyOrderPaymentAuthority } = await import("@/lib/payments/order-payments");
    const result = await verifyOrderPaymentAuthority(orderRow.id, {
      orderTrackingId: "tracking-123",
      source: "status",
    });

    expect(result.ok).toBe(true);
    expect(result.verificationState).toBe("pending");
    expect(result.providerStatus).toBe("INVALID");
    expect(result.orderSnapshot.paymentStatus).toBe("pending");
    expect(result.message).toBe("Payment is still pending.");
    expect(supabase.getOrderRow()).toEqual(
      expect.objectContaining({
        status: "Pending Payment",
        order_status: "pending_payment",
        payment_status: "pending",
      }),
    );
  });

  it("keeps an order paid and flags it for review when stock deduction loses the race", async () => {
    const orderRow = createOrderRow({
      order_items: [
        {
          name: "Cupcake",
          quantity: 6,
          selected_size: null,
          selected_flavor: null,
        },
      ],
    });
    const inventoryAttemptedAt = new Date().toISOString();
    const supabase = buildSupabaseHarness(orderRow, {
      onRpc: async (name, args, state) => {
        expect(name).toBe("attempt_paid_order_inventory_deduction");
        expect(args).toEqual({ p_order_id: orderRow.id });

        state.orderRow = {
          ...state.orderRow,
          status: "Paid",
          order_status: "paid",
          payment_status: "paid",
          paid_at: inventoryAttemptedAt,
          fulfillment_review_required: true,
          fulfillment_review_reason: "Payment succeeded, but stock could not be deducted for one or more items.",
          inventory_conflict: true,
          inventory_deduction_status: "conflict",
          inventory_deduction_attempted_at: inventoryAttemptedAt,
        };

        return {
          data: {
            inventory_deduction_status: "conflict",
            fulfillment_review_required: true,
            fulfillment_review_reason: state.orderRow.fulfillment_review_reason,
            inventory_conflict: true,
            reserved_item_count: 0,
            conflicted_item_count: 1,
          },
          error: null,
        };
      },
    });

    getSupabaseServerClientMock.mockReturnValue(supabase.client);
    getPaymentGatewayMock.mockReturnValue({
      verifyPayment: vi.fn().mockResolvedValue({
        provider: "pesapal",
        providerReference: "tracking-123",
        paymentStatus: "paid",
        providerStatus: "COMPLETED",
        paymentReference: "ref-123",
        amount: 120000,
        currency: "UGX",
        rawResponse: { ok: true },
        verifiedAt: inventoryAttemptedAt,
      }),
    });

    const { verifyOrderPaymentAuthority } = await import("@/lib/payments/order-payments");
    const result = await verifyOrderPaymentAuthority(orderRow.id, {
      orderTrackingId: "tracking-123",
      source: "callback",
    });

    expect(result.ok).toBe(true);
    expect(result.verificationState).toBe("paid");
    expect(result.isNowPaid).toBe(true);
    expect(result.justBecamePaid).toBe(true);
    expect(result.orderSnapshot.paymentStatus).toBe("paid");
    expect(result.message).toBe(
      "Payment verified and paid transition persisted. Fulfillment review required due to stock conflict.",
    );
    expect(supabase.getOrderRow()).toEqual(
      expect.objectContaining({
        payment_status: "paid",
        fulfillment_review_required: true,
        inventory_conflict: true,
        inventory_deduction_status: "conflict",
      }),
    );
    expect(supabase.rpcSpy).toHaveBeenCalledTimes(1);
    expect(triggerAdminPaidOrderPushDispatchMock).toHaveBeenCalledTimes(1);
    expect(triggerAdminPaidOrderPushDispatchMock).toHaveBeenCalledWith(orderRow.id);
  });

  it("supports mixed carts by keeping paid state while marking partial stock conflicts for review", async () => {
    const orderRow = createOrderRow({
      total_ugx: 148000,
      total_price: 148000,
      order_items: [
        {
          name: "Cupcake",
          quantity: 6,
          selected_size: null,
          selected_flavor: null,
        },
        {
          name: "Bread",
          quantity: 2,
          selected_size: null,
          selected_flavor: null,
        },
      ],
    });
    const inventoryAttemptedAt = new Date().toISOString();
    const supabase = buildSupabaseHarness(orderRow, {
      onRpc: async (_name, _args, state) => {
        state.orderRow = {
          ...state.orderRow,
          status: "Paid",
          order_status: "paid",
          payment_status: "paid",
          paid_at: inventoryAttemptedAt,
          fulfillment_review_required: true,
          fulfillment_review_reason: "Payment succeeded and some stock was reserved, but one or more items could not be fully deducted.",
          inventory_conflict: true,
          inventory_deduction_status: "partial_conflict",
          inventory_deduction_attempted_at: inventoryAttemptedAt,
        };

        return {
          data: {
            inventory_deduction_status: "partial_conflict",
            fulfillment_review_required: true,
            fulfillment_review_reason: state.orderRow.fulfillment_review_reason,
            inventory_conflict: true,
            reserved_item_count: 1,
            conflicted_item_count: 1,
          },
          error: null,
        };
      },
    });

    getSupabaseServerClientMock.mockReturnValue(supabase.client);
    getPaymentGatewayMock.mockReturnValue({
      verifyPayment: vi.fn().mockResolvedValue({
        provider: "pesapal",
        providerReference: "tracking-123",
        paymentStatus: "paid",
        providerStatus: "COMPLETED",
        paymentReference: "ref-123",
        amount: 148000,
        currency: "UGX",
        rawResponse: { ok: true },
        verifiedAt: inventoryAttemptedAt,
      }),
    });

    const { verifyOrderPaymentAuthority } = await import("@/lib/payments/order-payments");
    const result = await verifyOrderPaymentAuthority(orderRow.id, {
      orderTrackingId: "tracking-123",
      source: "ipn",
    });

    expect(result.ok).toBe(true);
    expect(result.orderSnapshot.paymentStatus).toBe("paid");
    expect(result.message).toBe(
      "Payment verified and paid transition persisted. Fulfillment review required due to stock conflict.",
    );
    expect(supabase.getOrderRow()).toEqual(
      expect.objectContaining({
        payment_status: "paid",
        fulfillment_review_required: true,
        inventory_conflict: true,
        inventory_deduction_status: "partial_conflict",
      }),
    );
  });

  it("keeps the order paid and marks manual review when the inventory deduction RPC fails unexpectedly", async () => {
    const orderRow = createOrderRow();
    const verifiedAt = new Date().toISOString();
    const supabase = buildSupabaseHarness(orderRow, {
      onRpc: async () => {
        throw new Error("rpc unavailable");
      },
    });

    getSupabaseServerClientMock.mockReturnValue(supabase.client);
    getPaymentGatewayMock.mockReturnValue({
      verifyPayment: vi.fn().mockResolvedValue({
        provider: "pesapal",
        providerReference: "tracking-123",
        paymentStatus: "paid",
        providerStatus: "COMPLETED",
        paymentReference: "ref-123",
        amount: 120000,
        currency: "UGX",
        rawResponse: { ok: true },
        verifiedAt,
      }),
    });

    const { verifyOrderPaymentAuthority } = await import("@/lib/payments/order-payments");
    const result = await verifyOrderPaymentAuthority(orderRow.id, {
      orderTrackingId: "tracking-123",
      source: "status",
    });

    expect(result.ok).toBe(true);
    expect(result.orderSnapshot.paymentStatus).toBe("paid");
    expect(result.message).toBe(
      "Payment verified and paid transition persisted. Fulfillment review is required.",
    );
    expect(supabase.getOrderRow()).toEqual(
      expect.objectContaining({
        status: "Paid",
        order_status: "paid",
        payment_status: "paid",
        fulfillment_review_required: true,
        inventory_conflict: false,
        inventory_deduction_status: "review_required",
      }),
    );
  });

  it("recovers a softly-cancelled order back to paid when Pesapal later confirms success", async () => {
    const verifiedAt = new Date().toISOString();
    const orderRow = createOrderRow({
      status: "Cancelled",
      order_status: "cancelled",
      payment_status: "cancelled",
      paid_at: null,
      inventory_deduction_status: "not_started",
    });
    const supabase = buildSupabaseHarness(orderRow, {
      onRpc: async (_name, _args, state) => {
        state.orderRow = {
          ...state.orderRow,
          status: "Paid",
          order_status: "paid",
          payment_status: "paid",
          paid_at: verifiedAt,
          fulfillment_review_required: false,
          fulfillment_review_reason: null,
          inventory_conflict: false,
          inventory_deduction_status: "completed",
          inventory_deduction_attempted_at: verifiedAt,
        };

        return {
          data: {
            inventory_deduction_status: "completed",
            fulfillment_review_required: false,
            fulfillment_review_reason: null,
            inventory_conflict: false,
            reserved_item_count: 1,
            conflicted_item_count: 0,
          },
          error: null,
        };
      },
    });

    getSupabaseServerClientMock.mockReturnValue(supabase.client);
    getPaymentGatewayMock.mockReturnValue({
      verifyPayment: vi.fn().mockResolvedValue({
        provider: "pesapal",
        providerReference: "tracking-123",
        paymentStatus: "paid",
        providerStatus: "COMPLETED",
        paymentReference: "ref-123",
        amount: 120000,
        currency: "UGX",
        rawResponse: { ok: true },
        verifiedAt,
      }),
    });

    const { verifyOrderPaymentAuthority } = await import("@/lib/payments/order-payments");
    const result = await verifyOrderPaymentAuthority(orderRow.id, {
      orderTrackingId: "tracking-123",
      source: "ipn",
    });

    expect(result.ok).toBe(true);
    expect(result.isNowPaid).toBe(true);
    expect(result.orderSnapshot.paymentStatus).toBe("paid");
    expect(supabase.getOrderRow()).toEqual(
      expect.objectContaining({
        status: "Paid",
        order_status: "paid",
        payment_status: "paid",
        inventory_deduction_status: "completed",
      }),
    );
  });

  it("retries paid-order inventory deduction for already-paid orders that were never processed", async () => {
    const orderRow = createOrderRow({
      status: "Paid",
      order_status: "paid",
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      inventory_deduction_status: "not_started",
    });
    const inventoryAttemptedAt = new Date().toISOString();
    const supabase = buildSupabaseHarness(orderRow, {
      onRpc: async (_name, _args, state) => {
        state.orderRow = {
          ...state.orderRow,
          inventory_deduction_status: "completed",
          inventory_deduction_attempted_at: inventoryAttemptedAt,
          inventory_conflict: false,
          fulfillment_review_required: false,
          fulfillment_review_reason: null,
        };

        return {
          data: {
            inventory_deduction_status: "completed",
            fulfillment_review_required: false,
            fulfillment_review_reason: null,
            inventory_conflict: false,
            reserved_item_count: 1,
            conflicted_item_count: 0,
          },
          error: null,
        };
      },
    });

    getSupabaseServerClientMock.mockReturnValue(supabase.client);
    getPaymentGatewayMock.mockReturnValue({
      verifyPayment: vi.fn().mockResolvedValue({
        provider: "pesapal",
        providerReference: "tracking-123",
        paymentStatus: "pending",
        providerStatus: "PENDING",
        paymentReference: "ref-123",
        amount: 120000,
        currency: "UGX",
        rawResponse: { ok: true },
        verifiedAt: inventoryAttemptedAt,
      }),
    });

    const { verifyOrderPaymentAuthority } = await import("@/lib/payments/order-payments");
    const result = await verifyOrderPaymentAuthority(orderRow.id, {
      orderTrackingId: "tracking-123",
      source: "admin_reverify",
    });

    expect(result.ok).toBe(true);
    expect(result.stickyPaid).toBe(true);
    expect(result.orderSnapshot.paymentStatus).toBe("paid");
    expect(supabase.rpcSpy).toHaveBeenCalledTimes(1);
    expect(supabase.getOrderRow()).toEqual(
      expect.objectContaining({
        payment_status: "paid",
        inventory_deduction_status: "completed",
        fulfillment_review_required: false,
      }),
    );
    expect(triggerAdminPaidOrderPushDispatchMock).not.toHaveBeenCalled();
  });

  it("returns the canonical lifecycle label in the payment snapshot", async () => {
    const orderRow = createOrderRow({
      status: "Pending",
      order_status: "confirmed",
      payment_status: "paid",
    });
    const supabase = buildSupabaseHarness(orderRow);

    getSupabaseServerClientMock.mockReturnValue(supabase.client);

    const { getOrderPaymentSnapshot } = await import("@/lib/payments/order-payments");

    await expect(getOrderPaymentSnapshot(orderRow.id)).resolves.toEqual(
      expect.objectContaining({
        orderStatus: "Paid",
        paymentStatus: "paid",
        viewState: "success",
      }),
    );
  });
});
