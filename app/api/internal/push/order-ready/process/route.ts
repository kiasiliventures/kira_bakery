import { NextResponse, after } from "next/server";
import { z } from "zod";
import {
  extractBearerToken,
  InternalRequestAuthError,
  requireInternalRequestSigningSecret,
  verifyInternalRequestToken,
} from "@/lib/internal-auth";
import {
  processDueOrderReadyPushes,
  processOrderReadyPushDispatch,
} from "@/lib/push/order-ready";

export const runtime = "nodejs";
const READY_PROCESS_PURPOSE = "storefront_order_ready_process";

const kickoffBodySchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
});

function getCronSecret() {
  const value = process.env.CRON_SECRET?.trim();
  if (!value) {
    throw new Error("Missing required environment variable: CRON_SECRET");
  }
  return value;
}

function isCronAuthorized(request: Request) {
  return getBearerToken(request) === getCronSecret();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = kickoffBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Invalid push processing request.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const providedToken = extractBearerToken(request);
    if (!providedToken) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    verifyInternalRequestToken({
      token: providedToken,
      secret: requireInternalRequestSigningSecret("STOREFRONT_INTERNAL_AUTH_TOKEN"),
      issuer: "kira-bakery-admin",
      audience: "kira-bakery-storefront",
      purpose: READY_PROCESS_PURPOSE,
      method: "POST",
      path: new URL(request.url).pathname,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    after(async () => {
      try {
        await processOrderReadyPushDispatch(parsed.data.idempotencyKey);
      } catch (error) {
        console.error(
          "order_ready_push_kickoff_failed",
          error instanceof Error ? error.message : "unknown_error",
        );
      }
    });

    return NextResponse.json({
      accepted: true,
      idempotencyKey: parsed.data.idempotencyKey,
    }, { status: 202 });
  } catch (error) {
    if (error instanceof InternalRequestAuthError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to schedule push processing.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(50, Math.trunc(requestedLimit)))
      : 20;

    const result = await processDueOrderReadyPushes(limit);
    return NextResponse.json({
      ok: true,
      limit,
      ...result,
    });
  } catch (error) {
    console.error(
      "order_ready_push_cron_failed",
      error instanceof Error ? error.message : "unknown_error",
    );
    return NextResponse.json(
      { message: "Unable to process queued order ready pushes." },
      { status: 500 },
    );
  }
}
