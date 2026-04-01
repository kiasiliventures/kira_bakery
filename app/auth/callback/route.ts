import { NextResponse } from "next/server";
import {
  isStorefrontCustomerUser,
  mergeStorefrontCustomerMetadata,
} from "@/lib/auth/customer-source";
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

    if (flow === "sign-up") {
      const { data, error: getUserError } = await supabase.auth.getUser();

      if (getUserError || !data.user) {
        return redirectToAuthError(
          requestUrl,
          flow,
          nextPath,
          getUserError?.message ?? "We couldn't finish setting up your customer account.",
        );
      }

      if (!isStorefrontCustomerUser(data.user)) {
        const { error: updateUserError } = await supabase.auth.updateUser({
          data: mergeStorefrontCustomerMetadata(data.user.user_metadata),
        });

        if (updateUserError) {
          return redirectToAuthError(requestUrl, flow, nextPath, updateUserError.message);
        }
      }
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
