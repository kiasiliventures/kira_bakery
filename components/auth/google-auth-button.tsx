"use client";

import { useState } from "react";
import { buildAuthCallbackUrl, type AuthEntryFlow } from "@/lib/auth/redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

type GoogleAuthButtonProps = {
  flow: AuthEntryFlow;
  nextPath: string;
};

export function GoogleAuthButton({ flow, nextPath }: GoogleAuthButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onClick = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildAuthCallbackUrl(window.location.origin, nextPath, flow),
        },
      });

      if (signInError) {
        setError(signInError.message);
        setIsSubmitting(false);
      }
    } catch {
      setError("We couldn't start Google sign-in. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-center"
        loading={isSubmitting}
        onClick={() => {
          void onClick();
        }}
      >
        <GoogleIcon />
        Continue with Google
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      focusable="false"
    >
      <path
        d="M21.805 12.23c0-.72-.064-1.412-.183-2.077H12v3.93h5.5a4.705 4.705 0 0 1-2.044 3.086v2.563h3.307c1.935-1.782 3.042-4.404 3.042-7.502Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.074-.916 6.764-2.478l-3.307-2.563c-.917.614-2.09.977-3.457.977-2.66 0-4.913-1.797-5.72-4.214H2.86v2.644A9.998 9.998 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.28 13.722A5.996 5.996 0 0 1 5.96 12c0-.598.108-1.177.32-1.722V7.634H2.86A10 10 0 0 0 2 12c0 1.61.385 3.132.86 4.366l3.42-2.644Z"
        fill="#FBBC04"
      />
      <path
        d="M12 6.064c1.5 0 2.848.516 3.91 1.53l2.933-2.933C17.07 3.008 14.755 2 12 2A9.998 9.998 0 0 0 2.86 7.634l3.42 2.644C7.087 7.861 9.34 6.064 12 6.064Z"
        fill="#EA4335"
      />
    </svg>
  );
}
