import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export type OperationalIncidentSeverity = "critical" | "high" | "medium" | "low";

type OperationalIncidentInput = {
  type: string;
  severity: OperationalIncidentSeverity;
  source: string;
  message: string;
  orderId?: string | null;
  paymentTrackingId?: string | null;
  dedupeKey: string;
  context?: Record<string, unknown>;
};

export async function reportOperationalIncident(
  input: OperationalIncidentInput,
): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("report_ops_incident", {
    p_incident_type: input.type,
    p_severity: input.severity,
    p_source: input.source,
    p_message: input.message,
    p_order_id: input.orderId ?? null,
    p_payment_tracking_id: input.paymentTrackingId ?? null,
    p_dedupe_key: input.dedupeKey,
    p_context: input.context ?? {},
  });

  if (error) {
    throw new Error(`Unable to report operational incident: ${error.message}`);
  }

  if (typeof data !== "string" || data.length === 0) {
    throw new Error("Operational incident report returned no incident id.");
  }

  return data;
}

export async function captureOperationalIncident(
  input: OperationalIncidentInput,
): Promise<void> {
  try {
    await reportOperationalIncident(input);
  } catch (error) {
    console.error("ops_incident_report_failed", {
      type: input.type,
      source: input.source,
      dedupeKey: input.dedupeKey,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}
