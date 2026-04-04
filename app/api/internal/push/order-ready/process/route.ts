import { NextResponse, after } from "next/server";
import { z } from "zod";
import {
  processDueOrderReadyPushes,
  processOrderReadyPushDispatch,
} from "@/lib/push/order-ready";

export const runtime = "nodejs";

const kickoffBodySchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
});

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function requireInternalAuthToken() {
  const token = process.env.STOREFRONT_INTERNAL_AUTH_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing required environment variable: STOREFRONT_INTERNAL_AUTH_TOKEN");
  }

  return token;
}

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

function isInternalAuthorized(request: Request) {
  return getBearerToken(request) === requireInternalAuthToken();
}

export async function POST(request: Request) {
  try {
    if (!isInternalAuthorized(request)) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

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
