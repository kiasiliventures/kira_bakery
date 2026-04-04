import { NextResponse } from "next/server";
import {
  extractBearerToken,
  InternalRequestAuthError,
  requireInternalRequestSigningSecret,
  verifyInternalRequestToken,
} from "@/lib/internal-auth";
import {
  paymentSyncSources,
  type PaymentSyncSource,
} from "@/lib/payments/gateway";
import { verifyOrderPaymentAuthority } from "@/lib/payments/order-payments";

type VerifyAuthorityRequestBody = {
  source?: PaymentSyncSource;
};

const paymentSyncSourceSet = new Set<string>(paymentSyncSources);
const PAYMENT_VERIFY_PURPOSE = "payment_authority_verify";

class BadRequestError extends Error {}

async function parseRequestBody(request: Request): Promise<VerifyAuthorityRequestBody | null> {
  return (await request.json().catch(() => null)) as VerifyAuthorityRequestBody | null;
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
    const params = await context.params;
    const orderId = params.id?.trim();

    if (!orderId) {
      return NextResponse.json({ message: "Missing orderId." }, { status: 400 });
    }

    const providedToken = extractBearerToken(request);
    if (!providedToken) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    verifyInternalRequestToken({
      token: providedToken,
      secret: requireInternalRequestSigningSecret("INTERNAL_PAYMENT_AUTHORITY_TOKEN"),
      issuer: "kira-bakery-admin",
      audience: "kira-bakery-storefront",
      purpose: PAYMENT_VERIFY_PURPOSE,
      method: "POST",
      path: new URL(request.url).pathname,
      orderId,
    });

    const body = await parseRequestBody(request);
    const source = resolveSource(body?.source);
    const result = await verifyOrderPaymentAuthority(orderId, { source });

    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    if (error instanceof InternalRequestAuthError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    if (error instanceof BadRequestError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to verify order payment." },
      { status: 500 },
    );
  }
}
