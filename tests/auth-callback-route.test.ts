import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_ORIGIN_METADATA_KEY,
  STOREFRONT_CUSTOMER_ORIGIN,
} from "@/lib/auth/customer-source";

const exchangeCodeForSessionMock = vi.fn();
const getUserMock = vi.fn();
const updateUserMock = vi.fn();
const getSupabaseAuthServerClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAuthServerClient: getSupabaseAuthServerClientMock,
}));

describe("auth callback route", () => {
  beforeEach(() => {
    exchangeCodeForSessionMock.mockReset();
    getUserMock.mockReset();
    updateUserMock.mockReset();
    getSupabaseAuthServerClientMock.mockReset();
    getSupabaseAuthServerClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession: exchangeCodeForSessionMock,
        getUser: getUserMock,
        updateUser: updateUserMock,
      },
    });
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "customer-123",
          user_metadata: {},
        },
      },
      error: null,
    });
    updateUserMock.mockResolvedValue({ error: null });
  });

  it("redirects provider errors back to the originating auth page", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new Request(
        "https://example.com/auth/callback?flow=sign-up&next=%2Fmenu&error=access_denied",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/account/sign-up?next=%2Fmenu&error=access_denied",
    );
    expect(getSupabaseAuthServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects callback requests without a code", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new Request("https://example.com/auth/callback?next=%2Faccount%2Forders"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/account/sign-in?next=%2Faccount%2Forders&error=We+couldn%27t+complete+Google+sign-in.+Please+try+again.",
    );
    expect(getSupabaseAuthServerClientMock).not.toHaveBeenCalled();
  });

  it("exchanges the auth code and redirects to the safe next path", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new Request("https://example.com/auth/callback?code=oauth-code&next=%2Fmenu"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/menu");
    expect(getSupabaseAuthServerClientMock).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("oauth-code");
    expect(getUserMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("marks Google sign-up accounts as storefront customers before redirecting", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new Request(
        "https://example.com/auth/callback?code=oauth-code&flow=sign-up&next=%2Fmenu",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/menu");
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledWith({
      data: {
        [CUSTOMER_ORIGIN_METADATA_KEY]: STOREFRONT_CUSTOMER_ORIGIN,
      },
    });
  });

  it("marks Google sign-in accounts as storefront customers before redirecting when metadata is missing", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new Request(
        "https://example.com/auth/callback?code=oauth-code&flow=sign-in&next=%2Faccount%2Forders",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/account/orders");
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledWith({
      data: {
        [CUSTOMER_ORIGIN_METADATA_KEY]: STOREFRONT_CUSTOMER_ORIGIN,
      },
    });
  });

  it("does not rewrite admin-provisioned accounts during Google sign-in", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "staff-123",
          user_metadata: {},
          app_metadata: {
            role: "staff",
            provisioned_by_admin: true,
          },
        },
      },
      error: null,
    });

    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new Request(
        "https://example.com/auth/callback?code=oauth-code&flow=sign-in&next=%2Fmenu",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/menu");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("sends exchange failures back to sign-in with the error message", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      error: {
        message: "Auth code exchange failed.",
      },
    });

    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new Request(
        "https://example.com/auth/callback?code=oauth-code&next=%2Faccount%2Fsign-in%3Fnext%3D%2Fmenu",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/account/sign-in?next=%2Faccount%2Forders&error=Auth+code+exchange+failed.",
    );
  });
});
