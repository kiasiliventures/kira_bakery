import { NextResponse, after } from "next/server";
import { z } from "zod";
import {
  extractBearerToken,
  InternalRequestAuthError,
  requireInternalRequestSigningSecret,
  verifyInternalRequestToken,
} from "@/lib/internal-auth";
import {
  enqueueOrderReadyPush,
  processOrderReadyPushDispatch,
} from "@/lib/push/order-ready";

const READY_TRIGGER_PURPOSE = "storefront_order_ready_trigger";
const readyPushTriggerBodySchema = z.object({
  source: z.literal("admin_order_status_patch"),
  orderStatus: z.literal("Ready"),
  orderUpdatedAt: z.string().datetime({ offset: true, message: "Invalid orderUpdatedAt timestamp." }),
});

function getIdempotencyKey(request: Request) {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key || key.length > 200) {
    return null;
  }

  return key;
}

function buildExpectedIdempotencyKey(orderId: string, orderUpdatedAt: string) {
  return `order-ready:${orderId}:${orderUpdatedAt}`;
}

async function parseBody(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = readyPushTriggerBodySchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          message: "Invalid ready push trigger payload.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true as const,
    data: parsed.data,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const idempotencyKey = getIdempotencyKey(request);
    if (!idempotencyKey) {
      return NextResponse.json({ message: "Missing Idempotency-Key header." }, { status: 400 });
    }

    const parsedBody = await parseBody(request);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    if (parsedBody.data.orderStatus !== "Ready") {
      return NextResponse.json({ message: "Only Ready pushes are supported." }, { status: 400 });
    }

    const params = await context.params;
    const orderId = params.id?.trim();
    if (!orderId) {
      return NextResponse.json({ message: "Missing order id." }, { status: 400 });
    }

    const providedToken = extractBearerToken(request);
    if (!providedToken) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const expectedIdempotencyKey = buildExpectedIdempotencyKey(
      orderId,
      parsedBody.data.orderUpdatedAt,
    );
    if (idempotencyKey !== expectedIdempotencyKey) {
      return NextResponse.json(
        { message: "Invalid Idempotency-Key header for this Ready transition." },
        { status: 400 },
      );
    }

    verifyInternalRequestToken({
      token: providedToken,
      secret: requireInternalRequestSigningSecret("STOREFRONT_INTERNAL_AUTH_TOKEN"),
      issuer: "kira-bakery-admin",
      audience: "kira-bakery-storefront",
      purpose: READY_TRIGGER_PURPOSE,
      method: "POST",
      path: new URL(request.url).pathname,
      orderId,
      idempotencyKey,
    });

    const result = await enqueueOrderReadyPush({
      idempotencyKey,
      orderId,
      orderUpdatedAt: parsedBody.data.orderUpdatedAt,
      source: parsedBody.data.source,
    });

    after(async () => {
      try {
        await processOrderReadyPushDispatch(idempotencyKey);
      } catch (error) {
        console.error(
          "order_ready_push_legacy_route_processing_failed",
          error instanceof Error ? error.message : "unknown_error",
        );
      }
    });

    return NextResponse.json({
      ok: true,
      accepted: true,
      duplicate: result.duplicate,
      orderId: result.orderId,
      idempotencyKey: result.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof InternalRequestAuthError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to trigger order ready push notification.",
      },
      { status: 500 },
    );
  }
}
