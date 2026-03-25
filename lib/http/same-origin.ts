import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getForwardedHeaderValue(request: Request, name: string): string | null {
  const value = request.headers.get(name);
  if (!value) {
    return null;
  }

  return value.split(",")[0]?.trim() || null;
}

function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = getForwardedHeaderValue(request, "x-forwarded-proto");
  const forwardedHost = getForwardedHeaderValue(request, "x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const protocol = forwardedProto ?? url.protocol.replace(/:$/, "");

  return `${protocol}://${host}`;
}

function forbidden(message: string) {
  return NextResponse.json({ message }, { status: 403 });
}

export function validateSameOriginMutation(request: Request): NextResponse | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const expectedOrigin = getRequestOrigin(request);
  const originHeader = request.headers.get("origin");

  if (originHeader) {
    if (originHeader !== expectedOrigin) {
      return forbidden("Cross-site mutation request rejected.");
    }

    return null;
  }

  const refererHeader = request.headers.get("referer");
  if (!refererHeader) {
    return forbidden("Missing Origin or Referer header.");
  }

  let refererOrigin: string;

  try {
    refererOrigin = new URL(refererHeader).origin;
  } catch {
    return forbidden("Invalid Referer header.");
  }

  if (refererOrigin !== expectedOrigin) {
    return forbidden("Cross-site mutation request rejected.");
  }

  return null;
}
