import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseServerClientMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

describe("enforceRateLimit", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getSupabaseServerClientMock.mockReset();
    getSupabaseServerClientMock.mockReturnValue({
      rpc: rpcMock,
    });
  });

  it("uses the shared consume_rate_limit rpc and returns the provider result", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          allowed: true,
          remaining: 11,
          retry_after_seconds: 60,
        },
      ],
      error: null,
    });

    const { enforceRateLimit } = await import("@/lib/rate-limit");
    const request = new Request("https://example.com/api/checkout", {
      headers: {
        "user-agent": "vitest",
        "cf-connecting-ip": "203.0.113.4",
      },
    });

    const result = await enforceRateLimit(request, "checkout", 12, 60_000, {
      bucketSuffix: "order-123",
    });

    expect(rpcMock).toHaveBeenCalledWith("consume_rate_limit", {
      rate_key: expect.stringMatching(/^checkout:[a-f0-9]{64}$/),
      max_requests: 12,
      window_seconds: 60,
    });
    expect(result).toEqual({
      allowed: true,
      remaining: 11,
      retryAfterSeconds: 60,
    });
  });

  it("throws when the shared rate-limit rpc fails", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "permission denied",
      },
    });

    const { enforceRateLimit } = await import("@/lib/rate-limit");
    const request = new Request("https://example.com/api/checkout", {
      headers: {
        "user-agent": "vitest",
        "cf-connecting-ip": "203.0.113.4",
      },
    });

    await expect(enforceRateLimit(request, "checkout", 12, 60_000)).rejects.toThrow(
      "Rate limit check failed: permission denied",
    );
  });
});
