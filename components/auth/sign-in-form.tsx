"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SignInFormProps = {
  nextPath: string;
};

export function SignInForm({ nextPath }: SignInFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (formData: FormData) => {
    setError(null);
    setIsSubmitting(true);

    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-md">
      <Card className="rounded-[28px] border-2 border-accent/30 bg-surface shadow-[var(--shadow-modal)]">
        <CardHeader className="space-y-3 p-8 pb-5">
          <p className="text-sm uppercase tracking-[0.25em] text-badge-foreground">KiRA Bakery</p>
          <CardTitle className="font-serif text-4xl text-foreground">Sign In</CardTitle>
          <p className="text-sm leading-6 text-muted">
            View your orders faster and check out without re-entering your details every time.
          </p>
        </CardHeader>
        <CardContent className="p-8 pt-0">
          <form action={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button className="w-full" loading={isSubmitting}>
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted">
            New here?{" "}
            <Link href={`/account/sign-up?next=${encodeURIComponent(nextPath)}`} className="font-medium text-accent hover:underline">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
