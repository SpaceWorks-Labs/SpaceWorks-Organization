"use client";

import { useState, useTransition } from "react";
import { confirmEmailVerification } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";

/** `next` is a validated staff invite path: after confirming, the visitor goes to sign in and lands back on it. */
export function VerifyEmailForm({ token, next }: { token: string; next?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-body-ui text-ink-secondary">
        Confirming your email activates your account so you can join organisations and manage your memberships.
      </p>
      {error ? <Callout tone="danger" role="alert" className="text-left">{error}</Callout> : null}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            let result;
            try { result = await confirmEmailVerification({ token, next }); }
            catch { setError("Email verification is temporarily unavailable. Please try again."); return; }
            if (!result.ok) {
              setError(result.error);
              return;
            }
            // A full page load, so nothing from this signed-out page carries into the signed-in one.
            const back = result.data?.next;
            window.location.assign(back ? `/login?verified=1&callbackUrl=${encodeURIComponent(back)}` : "/login?verified=1");
          });
        }}
      >
        {pending ? "Confirming…" : "Confirm email"}
      </Button>
    </div>
  );
}
