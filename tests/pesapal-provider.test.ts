import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function setRequiredPesapalEnv(overrides?: Partial<NodeJS.ProcessEnv>) {
  process.env.PESAPAL_BASE_URL = overrides?.PESAPAL_BASE_URL ?? "https://pay.pesapal.com/v3";
  process.env.PESAPAL_CONSUMER_KEY = overrides?.PESAPAL_CONSUMER_KEY ?? "consumer-key";
  process.env.PESAPAL_CONSUMER_SECRET = overrides?.PESAPAL_CONSUMER_SECRET ?? "consumer-secret";

  if (overrides && "PESAPAL_CALLBACK_URL" in overrides) {
    process.env.PESAPAL_CALLBACK_URL = overrides.PESAPAL_CALLBACK_URL;
  } else {
    delete process.env.PESAPAL_CALLBACK_URL;
  }

  if (overrides && "PESAPAL_IPN_URL" in overrides) {
    process.env.PESAPAL_IPN_URL = overrides.PESAPAL_IPN_URL;
  } else {
    delete process.env.PESAPAL_IPN_URL;
  }
}

describe("Pesapal provider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("rejects localhost-derived callback and IPN URLs before calling Pesapal", async () => {
    setRequiredPesapalEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { submitPesapalOrderRequest } = await import("@/lib/payments/providers/pesapal");

    await expect(
      submitPesapalOrderRequest({
        orderId: "order-123",
        amountUGX: 12000,
        description: "Kira Bakery order order-123",
        customerName: "Jane Doe",
        phone: "+256700000000",
        email: "jane@example.com",
        requestOrigin: "http://localhost:3000",
      }),
    ).rejects.toThrow(/PESAPAL_IPN_URL.*public URL/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits a normalized payload when public Pesapal URLs are configured", async () => {
    setRequiredPesapalEnv({
      PESAPAL_BASE_URL: "https://pay.pesapal.com/v3",
      PESAPAL_CALLBACK_URL: "https://kira-bakery.example.com/payment/result",
      PESAPAL_IPN_URL: "https://kira-bakery.example.com/api/payments/pesapal/ipn",
    });

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/Auth/RequestToken")) {
        return jsonResponse({ token: "token-123" });
      }

      if (url.endsWith("/api/URLSetup/GetIpnList")) {
        return jsonResponse({
          data: [
            {
              ipn_id: "ipn-123",
              url: "https://kira-bakery.example.com/api/payments/pesapal/ipn",
            },
          ],
        });
      }

      if (url.endsWith("/api/Transactions/SubmitOrderRequest")) {
        return jsonResponse({
          order_tracking_id: "tracking-123",
          merchant_reference: "order-123",
          redirect_url: "https://pay.pesapal.com/iframe?OrderTrackingId=tracking-123",
          status: "200",
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { submitPesapalOrderRequest } = await import("@/lib/payments/providers/pesapal");

    const response = await submitPesapalOrderRequest({
      orderId: "order-123",
      amountUGX: 12000,
      description: "Kira Bakery order order-123",
      customerName: "Jane Mary Doe",
      phone: "+256 700 000000",
      email: " jane@example.com ",
      requestOrigin: "https://kira-bakery.example.com",
    });

    expect(response.order_tracking_id).toBe("tracking-123");
    expect(response.redirect_url).toContain("tracking-123");

    const submitCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/Transactions/SubmitOrderRequest"),
    );

    expect(submitCall).toBeTruthy();
    const submitPayload = JSON.parse(String(submitCall?.[1]?.body ?? "{}"));

    expect(submitPayload).toMatchObject({
      id: "order-123",
      currency: "UGX",
      amount: 12000,
      description: "Kira Bakery order order-123",
      redirect_mode: "TOP_WINDOW",
      callback_url: "https://kira-bakery.example.com/payment/result?orderId=order-123",
      cancellation_url: "https://kira-bakery.example.com/payment/result?orderId=order-123&cancelled=1",
      notification_id: "ipn-123",
      billing_address: {
        email_address: "jane@example.com",
        phone_number: "+256700000000",
        country_code: "UG",
        first_name: "Jane Mary",
        last_name: "Doe",
      },
    });
  });

  it("warns when a public request origin is still using the Pesapal sandbox endpoint", async () => {
    setRequiredPesapalEnv({
      PESAPAL_BASE_URL: "https://cybqa.pesapal.com/pesapalv3",
      PESAPAL_CALLBACK_URL: "https://kira-bakery.example.com/payment/result",
      PESAPAL_IPN_URL: "https://kira-bakery.example.com/api/payments/pesapal/ipn",
    });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith("/api/Auth/RequestToken")) {
        return jsonResponse({ token: "token-123" });
      }

      if (url.endsWith("/api/URLSetup/GetIpnList")) {
        return jsonResponse({
          data: [
            {
              ipn_id: "ipn-123",
              url: "https://kira-bakery.example.com/api/payments/pesapal/ipn",
            },
          ],
        });
      }

      if (url.endsWith("/api/Transactions/SubmitOrderRequest")) {
        return jsonResponse({
          order_tracking_id: "tracking-123",
          redirect_url: "https://cybqa.pesapal.com/pesapaliframe/tracking-123",
          status: "200",
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    const { submitPesapalOrderRequest } = await import("@/lib/payments/providers/pesapal");

    await submitPesapalOrderRequest({
      orderId: "order-123",
      amountUGX: 12000,
      description: "Kira Bakery order order-123",
      customerName: "Jane Doe",
      phone: "+256700000000",
      email: "jane@example.com",
      requestOrigin: "https://kira-bakery.example.com",
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "pesapal_environment_mismatch",
      expect.objectContaining({
        requestOrigin: "https://kira-bakery.example.com",
        baseUrl: "https://cybqa.pesapal.com/pesapalv3",
      }),
    );
  });
});
