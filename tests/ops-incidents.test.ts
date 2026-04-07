import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseServerClientMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

describe("operational incident reporting", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getSupabaseServerClientMock.mockReset();
    getSupabaseServerClientMock.mockReturnValue({
      rpc: rpcMock,
    });
  });

  it("reports an incident through the shared rpc", async () => {
    rpcMock.mockResolvedValue({
      data: "incident-123",
      error: null,
    });

    const { reportOperationalIncident } = await import("@/lib/ops/incidents");
    const incidentId = await reportOperationalIncident({
      type: "payment_ipn_sync_failed",
      severity: "high",
      source: "pesapal_ipn",
      message: "Pesapal IPN payment sync failed.",
      orderId: "4ecf46c0-17fe-4fba-8fe2-6b58a4c3409f",
      paymentTrackingId: "tracking-123",
      dedupeKey: "payment_ipn_sync_failed:4ecf46c0-17fe-4fba-8fe2-6b58a4c3409f:tracking-123",
      context: {
        error: "provider_timeout",
      },
    });

    expect(rpcMock).toHaveBeenCalledWith("report_ops_incident", {
      p_incident_type: "payment_ipn_sync_failed",
      p_severity: "high",
      p_source: "pesapal_ipn",
      p_message: "Pesapal IPN payment sync failed.",
      p_order_id: "4ecf46c0-17fe-4fba-8fe2-6b58a4c3409f",
      p_payment_tracking_id: "tracking-123",
      p_dedupe_key: "payment_ipn_sync_failed:4ecf46c0-17fe-4fba-8fe2-6b58a4c3409f:tracking-123",
      p_context: {
        error: "provider_timeout",
      },
    });
    expect(incidentId).toBe("incident-123");
  });

  it("swallows incident reporting failures in captureOperationalIncident", async () => {
    const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "permission denied",
      },
    });

    const { captureOperationalIncident } = await import("@/lib/ops/incidents");
    await expect(
      captureOperationalIncident({
        type: "order_ready_push_failed",
        severity: "medium",
        source: "order_ready_push",
        message: "Customer ready push exhausted retries.",
        dedupeKey: "order_ready_push_failed:order-123",
      }),
    ).resolves.toBeUndefined();

    expect(consoleErrorMock).toHaveBeenCalledWith(
      "ops_incident_report_failed",
      expect.objectContaining({
        type: "order_ready_push_failed",
        source: "order_ready_push",
        dedupeKey: "order_ready_push_failed:order-123",
      }),
    );

    consoleErrorMock.mockRestore();
  });
});
