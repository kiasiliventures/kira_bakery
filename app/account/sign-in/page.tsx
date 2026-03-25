import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getAuthenticatedUser } from "@/lib/supabase/server";

function resolveNextPath(nextParam: string | string[] | undefined) {
  if (typeof nextParam !== "string" || !nextParam.startsWith("/")) {
    return "/account/orders";
  }

  return nextParam;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/account/orders");
  }

  const resolvedSearchParams = await searchParams;
  const nextPath = resolveNextPath(resolvedSearchParams.next);

  return <SignInForm nextPath={nextPath} />;
}
