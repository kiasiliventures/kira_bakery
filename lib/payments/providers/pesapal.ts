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

type PesapalTokenResponse = {
  token?: string;
  status?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
};

type PesapalIpnRecord = {
  ipn_id: string;
  url: string;
  created_date?: string;
  ipn_notification_type?: string;
};

type PesapalIpnListResponse = {
  status?: string;
  message?: string;
  data?: PesapalIpnRecord[];
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
};

type PesapalRegisterIpnResponse = {
  ipn_id?: string;
  url?: string;
  status?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
};

export type PesapalSubmitOrderInput = {
  orderId: string;
  amountUGX: number;
  description: string;
  customerName: string;
  orderAccessLinkToken?: string | null;
  phone?: string | null;
  email?: string | null;
  requestOrigin?: string | null;
};

export type PesapalSubmitOrderResponse = {
  order_tracking_id: string;
  merchant_reference?: string;
  redirect_url: string;
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
  status?: string;
  message?: string;
};

export type PesapalTransactionStatusResponse = {
  payment_method?: string;
  amount?: number;
  created_date?: string;
  confirmation_code?: string;
  payment_status_description?: string;
  description?: string;
  message?: string;
  status_code?: number | string;
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
};

export type NormalizedPesapalPaymentState = PaymentStatus;

type TokenCache = {
  token: string;
  expiresAt: number;
};

const provider: PaymentProviderName = "pesapal";

let tokenCache: TokenCache | null = null;
let ipnRegistrationCache: string | null = null;

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function getBaseUrl() {
  return getRequiredEnv("PESAPAL_BASE_URL").replace(/\/+$/, "");
}

function isPrivateOrLoopbackHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized === "localhost"
    || normalized === "::1"
    || normalized === "0.0.0.0"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
  ) {
    return true;
  }

  const ipv4Match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((segment) => Number(segment));
    if (octets.some((segment) => !Number.isInteger(segment) || segment < 0 || segment > 255)) {
      return true;
    }

    const [first, second] = octets;
    if (
      first === 0
      || first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
    ) {
      return true;
    }
  }

  if (
    normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe80:")
  ) {
    return true;
  }

  return false;
}

function ensurePesapalPublicUrl(
  urlValue: string,
  envName: "PESAPAL_CALLBACK_URL" | "PESAPAL_IPN_URL",
  options: { usedFallbackOrigin: boolean },
) {
  let parsed: URL;

  try {
    parsed = new URL(urlValue);
  } catch {
    throw new Error(`${envName} must be a valid absolute URL.`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${envName} must use http or https.`);
  }

  if (isPrivateOrLoopbackHostname(parsed.hostname)) {
    if (options.usedFallbackOrigin) {
      throw new Error(
        `${envName} is not configured and Pesapal cannot use the request-origin fallback ${parsed.origin}. `
        + `Set ${envName} to a public URL before initiating checkout.`,
      );
    }

    throw new Error(
      `${envName} must be a public URL. Pesapal cannot use ${parsed.origin}.`,
    );
  }

  return parsed.toString();
}

function logPesapalEnvironmentWarning(requestOrigin?: string | null) {
  if (!requestOrigin) {
    return;
  }

  try {
    const requestUrl = new URL(requestOrigin);
    const baseUrl = getBaseUrl();

    if (
      !isPrivateOrLoopbackHostname(requestUrl.hostname)
      && /:\/\/cybqa\.pesapal\.com\/pesapalv3\/?$/i.test(baseUrl)
    ) {
      console.warn("pesapal_environment_mismatch", {
        requestOrigin: requestUrl.origin,
        baseUrl,
        message: "Public checkout is using the Pesapal sandbox base URL.",
      });
    }
  } catch {
    // Ignore malformed request origins here; URL validation happens elsewhere.
  }
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

function getConfiguredOrRuntimeUrl(
  envName: "PESAPAL_CALLBACK_URL" | "PESAPAL_IPN_URL",
  pathname: string,
  requestOrigin?: string | null,
) {
  const configured = process.env[envName]?.trim();
  if (configured) {
    return ensurePesapalPublicUrl(configured, envName, { usedFallbackOrigin: false });
  }

  if (isProductionRuntime()) {
    throw new Error(`Missing required environment variable: ${envName}`);
  }

  return ensurePesapalPublicUrl(buildRuntimeUrl(pathname, requestOrigin), envName, {
    usedFallbackOrigin: true,
  });
}

function getCallbackUrl(
  orderId: string,
  orderAccessLinkToken?: string | null,
  requestOrigin?: string | null,
) {
  const url = new URL(
    getConfiguredOrRuntimeUrl(
      "PESAPAL_CALLBACK_URL",
      "/api/payments/pesapal/callback",
      requestOrigin,
    ),
  );
  url.searchParams.set("orderId", orderId);
  if (orderAccessLinkToken) {
    url.searchParams.set("access", orderAccessLinkToken);
  }
  return url.toString();
}

function getCancellationUrl(
  orderId: string,
  orderAccessLinkToken?: string | null,
  requestOrigin?: string | null,
) {
  const url = new URL(
    getConfiguredOrRuntimeUrl(
      "PESAPAL_CALLBACK_URL",
      "/api/payments/pesapal/callback",
      requestOrigin,
    ),
  );
  url.searchParams.set("orderId", orderId);
  if (orderAccessLinkToken) {
    url.searchParams.set("access", orderAccessLinkToken);
  }
  url.searchParams.set("cancelled", "1");
  return url.toString();
}

function getIpnUrl(requestOrigin?: string | null) {
  return getConfiguredOrRuntimeUrl(
    "PESAPAL_IPN_URL",
    "/api/payments/pesapal/ipn",
    requestOrigin,
  );
}

function splitCustomerName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return {
      firstName: parts[0] ?? "Guest",
      lastName: "Customer",
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "Customer",
  };
}

function normalizePesapalPhoneNumber(phone?: string | null) {
  const trimmed = phone?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\s+/g, "");
}

function normalizePesapalEmail(email?: string | null) {
  const trimmed = email?.trim();
  return trimmed ? trimmed : undefined;
}

function validatePesapalSubmitInput(input: PesapalSubmitOrderInput) {
  const orderId = input.orderId.trim();
  if (!/^[A-Za-z0-9._:-]{1,50}$/.test(orderId)) {
    throw new Error(
      "Pesapal merchant reference must be 1-50 characters and use only letters, numbers, dots, dashes, underscores, or colons.",
    );
  }

  const description = input.description.trim();
  if (!description) {
    throw new Error("Pesapal order description is required.");
  }

  if (description.length > 100) {
    throw new Error("Pesapal order description must be 100 characters or fewer.");
  }

  const email = normalizePesapalEmail(input.email);
  const phone = normalizePesapalPhoneNumber(input.phone);

  if (!email && !phone) {
    throw new Error("Pesapal requires either a customer email address or phone number.");
  }

  return {
    orderId,
    description,
    email,
    phone,
  };
}

async function parsePesapalResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Unexpected Pesapal response (${response.status}): ${text}`);
  }
}

async function pesapalRequest<T>(
  path: string,
  init: RequestInit,
  options?: { authenticated?: boolean },
): Promise<T> {
  const requestStartedAt = performance.now();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (options?.authenticated) {
    const token = await getPesapalAuthToken();
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const durationMs = Math.round((performance.now() - requestStartedAt) * 100) / 100;

  console.info("pesapal_request_timing", {
    path,
    method: init.method ?? "GET",
    status: response.status,
    durationMs,
    authenticated: Boolean(options?.authenticated),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pesapal request failed (${response.status}): ${errorText}`);
  }

  return parsePesapalResponse<T>(response);
}

export async function getPesapalAuthToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  console.info("pesapal_token_request_start", { baseUrl: getBaseUrl() });

  const response = await pesapalRequest<PesapalTokenResponse>("/api/Auth/RequestToken", {
    method: "POST",
    body: JSON.stringify({
      consumer_key: getRequiredEnv("PESAPAL_CONSUMER_KEY"),
      consumer_secret: getRequiredEnv("PESAPAL_CONSUMER_SECRET"),
    }),
  });

  if (!response.token) {
    const providerMessage =
      response.error?.message
      || response.message
      || response.status
      || "Pesapal token request did not return a token.";

    console.error("pesapal_token_request_failed", {
      status: response.status ?? null,
      message: response.message ?? null,
      errorCode: response.error?.code ?? null,
      errorType: response.error?.type ?? null,
      errorMessage: response.error?.message ?? null,
    });

    throw new Error(providerMessage);
  }

  tokenCache = {
    token: response.token,
    expiresAt: Date.now() + 1000 * 60 * 4,
  };

  console.info("pesapal_token_request_success");
  return response.token;
}

async function listPesapalRegisteredIpns() {
  console.info("pesapal_ipn_list_start", { baseUrl: getBaseUrl() });
  const response = await pesapalRequest<PesapalIpnListResponse>(
    "/api/URLSetup/GetIpnList",
    { method: "GET" },
    { authenticated: true },
  );
  console.info("pesapal_ipn_list_success", {
    count: response.data?.length ?? 0,
  });
  return response.data ?? [];
}

async function registerPesapalIpnUrl(ipnUrl: string) {
  console.info("pesapal_ipn_register_start", { url: ipnUrl });
  const response = await pesapalRequest<PesapalRegisterIpnResponse>(
    "/api/URLSetup/RegisterIPN",
    {
      method: "POST",
      body: JSON.stringify({
        url: ipnUrl,
        ipn_notification_type: "GET",
      }),
    },
    { authenticated: true },
  );

  if (!response.ipn_id) {
    console.error("pesapal_ipn_register_failed", {
      error: response.error?.message ?? response.message ?? "missing ipn id",
    });
    throw new Error(response.error?.message ?? response.message ?? "Pesapal IPN registration failed.");
  }

  console.info("pesapal_ipn_register_success", { ipnId: response.ipn_id, url: response.url ?? ipnUrl });
  return response.ipn_id;
}

export async function ensurePesapalIpnId(requestOrigin?: string | null) {
  if (ipnRegistrationCache) {
    return ipnRegistrationCache;
  }

  const configuredUrl = getIpnUrl(requestOrigin);
  const existing = await listPesapalRegisteredIpns();
  const matching = existing.find((entry) => entry.url === configuredUrl);

  if (matching?.ipn_id) {
    ipnRegistrationCache = matching.ipn_id;
    return matching.ipn_id;
  }

  ipnRegistrationCache = await registerPesapalIpnUrl(configuredUrl);
  return ipnRegistrationCache;
}

export async function submitPesapalOrderRequest(
  input: PesapalSubmitOrderInput,
): Promise<PesapalSubmitOrderResponse> {
  const normalizedInput = validatePesapalSubmitInput(input);
  logPesapalEnvironmentWarning(input.requestOrigin);
  const notificationId = await ensurePesapalIpnId(input.requestOrigin);
  const { firstName, lastName } = splitCustomerName(input.customerName);
  const callbackUrl = getCallbackUrl(
    normalizedInput.orderId,
    input.orderAccessLinkToken,
    input.requestOrigin,
  );
  const cancellationUrl = getCancellationUrl(
    normalizedInput.orderId,
    input.orderAccessLinkToken,
    input.requestOrigin,
  );

  const payload = {
    id: normalizedInput.orderId,
    currency: "UGX",
    amount: input.amountUGX,
    description: normalizedInput.description,
    redirect_mode: "TOP_WINDOW",
    callback_url: callbackUrl,
    cancellation_url: cancellationUrl,
    notification_id: notificationId,
    billing_address: {
      ...(normalizedInput.email ? { email_address: normalizedInput.email } : {}),
      ...(normalizedInput.phone ? { phone_number: normalizedInput.phone } : {}),
      country_code: "UG",
      first_name: firstName,
      middle_name: "",
      last_name: lastName,
      line_1: "Kira Bakery order",
      line_2: "",
      city: "Kampala",
      state: "",
      postal_code: "",
      zip_code: "",
    },
  };

  console.info("pesapal_submit_order_start", {
    orderId: normalizedInput.orderId,
    amountUGX: input.amountUGX,
    notificationId,
    callbackUrl,
  });
  console.info("PESAPAL_SUBMIT", {
    merchantReference: normalizedInput.orderId,
    amount: input.amountUGX,
    callbackUrl,
    cancellationUrl,
  });

  const response = await pesapalRequest<PesapalSubmitOrderResponse>(
    "/api/Transactions/SubmitOrderRequest",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    { authenticated: true },
  );

  if (!response.order_tracking_id || !response.redirect_url) {
    console.error("pesapal_submit_order_failed", {
      orderId: normalizedInput.orderId,
      status: response.status ?? null,
      message: response.message ?? null,
      errorCode: response.error?.code ?? null,
      errorType: response.error?.type ?? null,
      errorMessage: response.error?.message ?? null,
      callbackUrl,
      cancellationUrl,
    });
    throw new Error(
      response.error?.message ?? response.message ?? "Pesapal order request did not return redirect details.",
    );
  }

  console.info("pesapal_submit_order_success", {
    orderId: normalizedInput.orderId,
    orderTrackingId: response.order_tracking_id,
  });

  return response;
}

export async function getPesapalTransactionStatus(orderTrackingId: string) {
  console.info("pesapal_status_request_start", { orderTrackingId });
  const baseUrl = new URL(`${getBaseUrl()}/api/Transactions/GetTransactionStatus`);
  baseUrl.searchParams.set("orderTrackingId", orderTrackingId);

  const token = await getPesapalAuthToken();
  const requestStartedAt = performance.now();
  const response = await fetch(baseUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const durationMs = Math.round((performance.now() - requestStartedAt) * 100) / 100;
  console.info("pesapal_status_request_timing", {
    orderTrackingId,
    status: response.status,
    durationMs,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pesapal status request failed (${response.status}): ${errorText}`);
  }

  const parsed = await parsePesapalResponse<PesapalTransactionStatusResponse>(response);
  console.info("pesapal_status_request_success", {
    orderTrackingId,
    paymentStatus: parsed.payment_status_description ?? null,
  });
  return parsed;
}

export function normalizePesapalPaymentState(
  rawStatus: string | null | undefined,
): NormalizedPesapalPaymentState {
  const status = rawStatus?.trim().toUpperCase();
  if (status === "COMPLETED") {
    return "paid";
  }
  if (status === "FAILED" || status === "REVERSED") {
    return "failed";
  }
  if (status === "INVALID") {
    return "cancelled";
  }
  return "pending";
}

export function createPesapalGateway(): PaymentGateway {
  return {
    provider,
    async initiatePayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult> {
      const response = await submitPesapalOrderRequest({
        orderId: input.orderId,
        amountUGX: input.amount,
        description: input.description,
        customerName: input.customerName,
        orderAccessLinkToken: input.orderAccessLinkToken,
        phone: input.phone,
        email: input.email,
        requestOrigin: input.requestOrigin,
      });

      return {
        provider,
        providerReference: response.order_tracking_id,
        redirectUrl: response.redirect_url,
        paymentStatus: "pending",
        rawResponse: response,
      };
    },
    async verifyPayment(input: PaymentVerificationInput): Promise<PaymentVerificationResult> {
      const status = await getPesapalTransactionStatus(input.providerReference);
      const normalizedPaymentStatus = normalizePesapalPaymentState(status.payment_status_description);
      const normalizedAmount =
        status.amount != null ? Math.round(Number(status.amount)) : null;
      return {
        provider,
        providerReference: input.providerReference,
        paymentStatus: normalizedPaymentStatus,
        providerStatus: status.payment_status_description ?? null,
        paymentReference: status.confirmation_code ?? null,
        amount: normalizedAmount,
        currency: "UGX",
        rawResponse: status,
        verifiedAt: new Date().toISOString(),
      };
    },
  };
}
