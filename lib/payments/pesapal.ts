import "server-only";

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
  phone?: string | null;
  email?: string | null;
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

export type NormalizedPesapalPaymentState = "paid" | "failed" | "cancelled" | "pending";

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;
let ipnRegistrationCache: string | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getBaseUrl() {
  return requireEnv("PESAPAL_BASE_URL").replace(/\/+$/, "");
}

function getCallbackUrl(orderId: string) {
  const url = new URL(requireEnv("PESAPAL_CALLBACK_URL"));
  url.searchParams.set("orderId", orderId);
  return url.toString();
}

function getCancellationUrl(orderId: string) {
  const url = new URL(requireEnv("PESAPAL_CALLBACK_URL"));
  url.searchParams.set("orderId", orderId);
  url.searchParams.set("cancelled", "1");
  return url.toString();
}

function getIpnUrl() {
  return requireEnv("PESAPAL_IPN_URL");
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
  const baseUrl = getBaseUrl();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (options?.authenticated) {
    const token = await getPesapalAuthToken();
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
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

  const payload = {
    consumer_key: requireEnv("PESAPAL_CONSUMER_KEY"),
    consumer_secret: requireEnv("PESAPAL_CONSUMER_SECRET"),
  };

  const response = await pesapalRequest<PesapalTokenResponse>("/api/Auth/RequestToken", {
    method: "POST",
    body: JSON.stringify(payload),
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

async function registerPesapalIpnUrl() {
  console.info("pesapal_ipn_register_start", { url: getIpnUrl() });
  const response = await pesapalRequest<PesapalRegisterIpnResponse>(
    "/api/URLSetup/RegisterIPN",
    {
      method: "POST",
      body: JSON.stringify({
        url: getIpnUrl(),
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

  console.info("pesapal_ipn_register_success", { ipnId: response.ipn_id, url: response.url ?? getIpnUrl() });
  return response.ipn_id;
}

export async function ensurePesapalIpnId() {
  if (ipnRegistrationCache) {
    return ipnRegistrationCache;
  }

  const configuredUrl = getIpnUrl();
  const existing = await listPesapalRegisteredIpns();
  const matching = existing.find((entry) => entry.url === configuredUrl);

  if (matching?.ipn_id) {
    ipnRegistrationCache = matching.ipn_id;
    return matching.ipn_id;
  }

  ipnRegistrationCache = await registerPesapalIpnUrl();
  return ipnRegistrationCache;
}

export async function submitPesapalOrderRequest(
  input: PesapalSubmitOrderInput,
): Promise<PesapalSubmitOrderResponse> {
  const notificationId = await ensurePesapalIpnId();
  const { firstName, lastName } = splitCustomerName(input.customerName);

  const payload = {
    id: input.orderId,
    currency: "UGX",
    amount: input.amountUGX,
    description: input.description,
    callback_url: getCallbackUrl(input.orderId),
    cancellation_url: getCancellationUrl(input.orderId),
    notification_id: notificationId,
    billing_address: {
      email_address: input.email ?? "",
      phone_number: input.phone ?? "",
      country_code: "UG",
      first_name: firstName,
      last_name: lastName,
      line_1: "Kira Bakery order",
      city: "Kampala",
    },
  };

  console.info("pesapal_submit_order_start", {
    orderId: input.orderId,
    amountUGX: input.amountUGX,
    notificationId,
  });
  console.info("PESAPAL_SUBMIT", {
    merchantReference: input.orderId,
    amount: input.amountUGX,
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
      orderId: input.orderId,
      error: response.error?.message ?? response.message ?? "missing tracking or redirect URL",
    });
    throw new Error(
      response.error?.message ?? response.message ?? "Pesapal order request did not return redirect details.",
    );
  }

  console.info("pesapal_submit_order_success", {
    orderId: input.orderId,
    orderTrackingId: response.order_tracking_id,
  });

  return response;
}

export async function getPesapalTransactionStatus(orderTrackingId: string) {
  console.info("pesapal_status_request_start", { orderTrackingId });
  const baseUrl = new URL(`${getBaseUrl()}/api/Transactions/GetTransactionStatus`);
  baseUrl.searchParams.set("orderTrackingId", orderTrackingId);

  const token = await getPesapalAuthToken();
  const response = await fetch(baseUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
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
