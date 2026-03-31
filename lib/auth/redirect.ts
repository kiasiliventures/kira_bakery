export const DEFAULT_AUTH_REDIRECT_PATH = "/account/orders";

export type AuthEntryFlow = "sign-in" | "sign-up";

function isBlockedAuthRedirect(nextPath: string) {
  return (
    nextPath.startsWith("/account/sign-in") ||
    nextPath.startsWith("/account/sign-up") ||
    nextPath.startsWith("/auth/callback")
  );
}

export function readSearchParamValue(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function resolveAuthRedirectPath(nextParam: string | string[] | undefined) {
  const nextPath = readSearchParamValue(nextParam);

  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  if (isBlockedAuthRedirect(nextPath)) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  return nextPath;
}

export function resolveAuthEntryPath(flowParam: string | string[] | undefined) {
  return readSearchParamValue(flowParam) === "sign-up"
    ? "/account/sign-up"
    : "/account/sign-in";
}

export function buildAuthCallbackUrl(
  origin: string,
  nextPath: string,
  flow: AuthEntryFlow,
) {
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", resolveAuthRedirectPath(nextPath));
  callbackUrl.searchParams.set("flow", flow);
  return callbackUrl.toString();
}

export function buildAuthErrorRedirectUrl(
  origin: string,
  flowParam: string | string[] | undefined,
  nextParam: string | string[] | undefined,
  errorMessage: string,
) {
  const redirectUrl = new URL(resolveAuthEntryPath(flowParam), origin);
  redirectUrl.searchParams.set("next", resolveAuthRedirectPath(nextParam));
  redirectUrl.searchParams.set("error", errorMessage);
  return redirectUrl;
}
