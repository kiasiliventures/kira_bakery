import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import {
  readSearchParamValue,
  resolveAuthRedirectPath,
} from "@/lib/auth/redirect";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextPath = resolveAuthRedirectPath(resolvedSearchParams.next);
  const initialError = readSearchParamValue(resolvedSearchParams.error);
  const user = await getAuthenticatedUser();

  if (user) {
    redirect(nextPath);
  }

  return <SignInForm nextPath={nextPath} initialError={initialError} />;
}
