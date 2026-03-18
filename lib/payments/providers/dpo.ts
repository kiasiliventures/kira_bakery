import "server-only";

import { getRequiredEnv, type PaymentProviderName } from "@/lib/payments/config";
import type {
  PaymentGateway,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentStatus,
  PaymentVerificationInput,
  PaymentVerificationResult,
} from "@/lib/payments/gateway";

type DpoCreateTokenResponse = {
  Result: string | null;
  ResultExplanation: string | null;
  TransToken: string | null;
};

type DpoVerifyTokenResponse = {
  Result: string | null;
  ResultExplanation: string | null;
  TransToken: string | null;
  TransRef: string | null;
  CompanyRef: string | null;
  TransactionApproval: string | null;
  TransactionCurrency: string | null;
  TransactionAmount: string | null;
};

const provider: PaymentProviderName = "dpo";

function getBaseUrl() {
  return getRequiredEnv("DPO_BASE_URL").replace(/\/+$/, "");
}

function getApiUrl() {
  const baseUrl = getBaseUrl();
  if (/\/API\/v\d+$/i.test(baseUrl)) {
    return `${baseUrl}/`;
  }
  return `${baseUrl}/API/v6/`;
}

function buildRuntimeUrl(pathname: string, requestOrigin?: string | null) {
  if (requestOrigin) {
    return new URL(pathname, requestOrigin).toString();
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const normalized =
      vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://")
        ? vercelUrl
        : `https://${vercelUrl}`;
    return new URL(pathname, normalized).toString();
  }

  throw new Error(`Unable to build runtime URL for ${pathname}.`);
}

function buildCheckoutRedirectUrl(transactionToken: string) {
  const baseUrl = new URL(getBaseUrl());
  return new URL(`/payv2.php?ID=${encodeURIComponent(transactionToken)}`, `${baseUrl.origin}/`).toString();
}

function getResultUrl(
  orderId: string,
  accessToken?: string | null,
  requestOrigin?: string | null,
) {
  const url = new URL(buildRuntimeUrl("/payment/result", requestOrigin));
  url.searchParams.set("orderId", orderId);
  if (accessToken) {
    url.searchParams.set("accessToken", accessToken);
  }
  return url.toString();
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildApi3gXml(fields: Record<string, string>) {
  const lines = Object.entries(fields)
    .map(([key, value]) => `  <${key}>${escapeXml(value)}</${key}>`)
    .join("\n");
  return `<API3G>\n${lines}\n</API3G>`;
}

function extractXmlValue(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i");
  const match = xml.match(pattern);
  return match?.[1]?.trim() || null;
}

function parseDpoXml<T extends Record<string, string | null>>(
  xml: string,
  tagNames: Array<keyof T>,
): T {
  const entries = tagNames.map((tagName) => [tagName, extractXmlValue(xml, String(tagName))]);
  return Object.fromEntries(entries) as T;
}

async function dpoRequest(xmlBody: string) {
  const response = await fetch(getApiUrl(), {
    method: "POST",
    headers: {
      Accept: "application/xml, text/xml;q=0.9, */*;q=0.8",
      "Content-Type": "application/xml",
    },
    body: xmlBody,
    cache: "no-store",
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`DPO request failed (${response.status}): ${rawText}`);
  }

  return rawText;
}

function normalizeDpoPaymentState(rawStatus: string | null | undefined): PaymentStatus {
  const normalized = rawStatus?.trim().toLowerCase() || "";

  if (
    normalized.includes("approved")
    || normalized.includes("paid")
    || normalized.includes("completed")
    || normalized === "000"
  ) {
    return "paid";
  }

  if (normalized.includes("cancel")) {
    return "cancelled";
  }

  if (
    normalized.includes("declin")
    || normalized.includes("reject")
    || normalized.includes("fail")
    || normalized.includes("error")
  ) {
    return "failed";
  }

  return "pending";
}

async function createDpoToken(
  input: PaymentInitiationInput,
): Promise<{ parsed: DpoCreateTokenResponse; rawResponse: string }> {
  const xmlBody = buildApi3gXml({
    CompanyToken: getRequiredEnv("DPO_COMPANY_TOKEN"),
    Request: "createToken",
    TransactionType: "SALE",
    PaymentAmount: String(input.amount),
    PaymentCurrency: input.currency,
    CompanyRef: input.orderId,
    RedirectURL: getResultUrl(input.orderId, input.accessToken, input.requestOrigin),
    BackURL: getResultUrl(input.orderId, input.accessToken, input.requestOrigin),
    CompanyRefUnique: "0",
    PTL: "5",
    customerFirstName: input.customerName.split(/\s+/)[0] || "Guest",
    customerLastName: input.customerName.split(/\s+/).slice(1).join(" ") || "Customer",
    customerEmail: input.email ?? "",
    customerPhone: input.phone ?? "",
    customerCountry: "UG",
    customerAddress: "Kira Bakery order",
    customerCity: "Kampala",
    customerZip: "00000",
    ServiceType: getRequiredEnv("DPO_SERVICE_TYPE"),
    ServiceDescription: input.description,
    ServiceDate: new Date().toISOString().slice(0, 10),
  });

  const rawResponse = await dpoRequest(xmlBody);
  const parsed = parseDpoXml<DpoCreateTokenResponse>(rawResponse, [
    "Result",
    "ResultExplanation",
    "TransToken",
  ]);

  return { parsed, rawResponse };
}

async function verifyDpoToken(
  transactionToken: string,
): Promise<{ parsed: DpoVerifyTokenResponse; rawResponse: string }> {
  const xmlBody = buildApi3gXml({
    CompanyToken: getRequiredEnv("DPO_COMPANY_TOKEN"),
    Request: "verifyToken",
    TransactionToken: transactionToken,
  });

  const rawResponse = await dpoRequest(xmlBody);
  const parsed = parseDpoXml<DpoVerifyTokenResponse>(rawResponse, [
    "Result",
    "ResultExplanation",
    "TransToken",
    "TransRef",
    "CompanyRef",
    "TransactionApproval",
    "TransactionCurrency",
    "TransactionAmount",
  ]);

  return { parsed, rawResponse };
}

export function createDpoGateway(): PaymentGateway {
  return {
    provider,
    async initiatePayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult> {
      const { parsed, rawResponse } = await createDpoToken(input);

      if (parsed.Result !== "000" || !parsed.TransToken) {
        throw new Error(parsed.ResultExplanation || "DPO token creation failed.");
      }

      return {
        provider,
        providerReference: parsed.TransToken,
        redirectUrl: buildCheckoutRedirectUrl(parsed.TransToken),
        paymentStatus: "pending",
        rawResponse: {
          xml: rawResponse,
          parsed,
        },
      };
    },
    async verifyPayment(input: PaymentVerificationInput): Promise<PaymentVerificationResult> {
      const { parsed, rawResponse } = await verifyDpoToken(input.providerReference);
      const providerStatus = parsed.TransactionApproval || parsed.ResultExplanation;
      const amount = parsed.TransactionAmount ? Math.round(Number(parsed.TransactionAmount)) : null;

      return {
        provider,
        providerReference: parsed.TransToken || input.providerReference,
        paymentStatus: normalizeDpoPaymentState(providerStatus || parsed.Result),
        providerStatus: providerStatus ?? null,
        paymentReference: parsed.TransRef ?? null,
        amount: Number.isFinite(amount) ? amount : null,
        currency: parsed.TransactionCurrency ?? null,
        rawResponse: {
          xml: rawResponse,
          parsed,
        },
        verifiedAt: new Date().toISOString(),
      };
    },
  };
}
