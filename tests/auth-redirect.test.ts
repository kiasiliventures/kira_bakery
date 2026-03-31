import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTH_REDIRECT_PATH,
  buildAuthCallbackUrl,
  resolveAuthEntryPath,
  resolveAuthRedirectPath,
} from "@/lib/auth/redirect";

describe("auth redirect helpers", () => {
  it("keeps safe relative next paths", () => {
    expect(resolveAuthRedirectPath("/menu/chocolate-cake")).toBe("/menu/chocolate-cake");
  });

  it("falls back for invalid or looping auth destinations", () => {
    expect(resolveAuthRedirectPath("https://example.com/account/orders")).toBe(
      DEFAULT_AUTH_REDIRECT_PATH,
    );
    expect(resolveAuthRedirectPath("//evil.example.com")).toBe(
      DEFAULT_AUTH_REDIRECT_PATH,
    );
    expect(resolveAuthRedirectPath("/account/sign-in?next=/menu")).toBe(
      DEFAULT_AUTH_REDIRECT_PATH,
    );
    expect(resolveAuthRedirectPath("/auth/callback?next=/menu")).toBe(
      DEFAULT_AUTH_REDIRECT_PATH,
    );
  });

  it("resolves the auth entry page from the flow", () => {
    expect(resolveAuthEntryPath("sign-up")).toBe("/account/sign-up");
    expect(resolveAuthEntryPath("sign-in")).toBe("/account/sign-in");
    expect(resolveAuthEntryPath(undefined)).toBe("/account/sign-in");
  });

  it("builds the callback URL with flow and safe next path", () => {
    expect(
      buildAuthCallbackUrl("https://kirabakery.com", "/account/sign-in?next=/orders", "sign-up"),
    ).toBe(
      "https://kirabakery.com/auth/callback?next=%2Faccount%2Forders&flow=sign-up",
    );
    expect(buildAuthCallbackUrl("https://kirabakery.com", "/menu", "sign-in")).toBe(
      "https://kirabakery.com/auth/callback?next=%2Fmenu&flow=sign-in",
    );
  });
});
