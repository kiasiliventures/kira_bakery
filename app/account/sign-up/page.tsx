import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/sign-up-form";
import {
  readSearchParamValue,
  resolveAuthRedirectPath,
} from "@/lib/auth/redirect";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export default async function SignUpPage({
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

  return <SignUpForm nextPath={nextPath} initialError={initialError} />;
}
