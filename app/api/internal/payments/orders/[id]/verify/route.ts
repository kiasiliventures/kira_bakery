import { NextResponse } from "next/server";
import {
  paymentSyncSources,
  type PaymentSyncSource,
} from "@/lib/payments/gateway";
import { verifyOrderPaymentAuthority } from "@/lib/payments/order-payments";

type VerifyAuthorityRequestBody = {
  source?: PaymentSyncSource;
};

const paymentSyncSourceSet = new Set<string>(paymentSyncSources);

class BadRequestError extends Error {}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

async function parseRequestBody(request: Request): Promise<VerifyAuthorityRequestBody | null> {
  return (await request.json().catch(() => null)) as VerifyAuthorityRequestBody | null;
}

function resolveInternalAuthorityToken() {
  const token = process.env.INTERNAL_PAYMENT_AUTHORITY_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing required environment variable: INTERNAL_PAYMENT_AUTHORITY_TOKEN");
  }

  return token;
}

function resolveSource(value: string | undefined): PaymentSyncSource {
  if (!value) {
    return "admin_reverify";
  }

  if (!paymentSyncSourceSet.has(value)) {
    throw new BadRequestError("Invalid verification source.");
  }

  return value as PaymentSyncSource;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const token = resolveInternalAuthorityToken();
    const providedToken = getBearerToken(request);

    if (!providedToken || providedToken !== token) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const params = await context.params;
    const orderId = params.id?.trim();

    if (!orderId) {
      return NextResponse.json({ message: "Missing orderId." }, { status: 400 });
    }

    const body = await parseRequestBody(request);
    const source = resolveSource(body?.source);
    const result = await verifyOrderPaymentAuthority(orderId, { source });

    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to verify order payment." },
      { status: 500 },
    );
  }
}
