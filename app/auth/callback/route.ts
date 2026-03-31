import { NextResponse } from "next/server";
import { buildAuthErrorRedirectUrl, resolveAuthRedirectPath } from "@/lib/auth/redirect";
import { getSupabaseAuthServerClient } from "@/lib/supabase/server";

function redirectToAuthError(
  requestUrl: URL,
  flow: string | null,
  nextPath: string | null,
  errorMessage: string,
) {
  return NextResponse.redirect(
    buildAuthErrorRedirectUrl(
      requestUrl.origin,
      flow ?? undefined,
      nextPath ?? undefined,
      errorMessage,
    ),
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const flow = requestUrl.searchParams.get("flow");
  const nextPath = requestUrl.searchParams.get("next");
  const providerError =
    requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");

  if (providerError) {
    return redirectToAuthError(requestUrl, flow, nextPath, providerError);
  }

  if (!code) {
    return redirectToAuthError(
      requestUrl,
      flow,
      nextPath,
      "We couldn't complete Google sign-in. Please try again.",
    );
  }

  try {
    const supabase = await getSupabaseAuthServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirectToAuthError(requestUrl, flow, nextPath, error.message);
    }
  } catch {
    return redirectToAuthError(
      requestUrl,
      flow,
      nextPath,
      "We couldn't complete Google sign-in. Please try again.",
    );
  }

  return NextResponse.redirect(
    new URL(resolveAuthRedirectPath(nextPath ?? undefined), requestUrl.origin),
  );
}
