"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SignUpFormProps = {
  nextPath: string;
};

export function SignUpForm({ nextPath }: SignUpFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (formData: FormData) => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const fullName = String(formData.get("fullName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setIsSubmitting(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      router.replace(nextPath);
      router.refresh();
      return;
    }

    setMessage("Account created. Check your email to confirm your address, then sign in.");
    setIsSubmitting(false);
  };

  return (
    <div className="mx-auto max-w-md">
      <Card className="rounded-[28px] border-2 border-accent/30 bg-surface shadow-[var(--shadow-modal)]">
        <CardHeader className="space-y-3 p-8 pb-5">
          <p className="text-sm uppercase tracking-[0.25em] text-badge-foreground">KiRA Bakery</p>
          <CardTitle className="font-serif text-4xl text-foreground">Create Account</CardTitle>
          <p className="text-sm leading-6 text-muted">
            Save your details for faster checkout and keep track of every order in one place.
          </p>
        </CardHeader>
        <CardContent className="p-8 pt-0">
          <form action={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" autoComplete="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {message ? <p className="text-sm text-muted">{message}</p> : null}
            <Button className="w-full" loading={isSubmitting}>
              Create account
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted">
            Already have an account?{" "}
            <Link href={`/account/sign-in?next=${encodeURIComponent(nextPath)}`} className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
