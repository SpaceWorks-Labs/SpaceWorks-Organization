"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { revokeAllSessions } from "@/app/actions/security";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { AccountCard } from "@/components/account/AccountCard";

/** Revokes every issued session (including this browser) after confirmation. */
export function SignOutEverywhereCard() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <AccountCard
        id="sign-out-everywhere"
        tone="danger"
        title="Sign out everywhere"
        description="End every signed-in browser and device, including this one. You will need to sign in again."
        action={
          <Button variant="danger" startIcon={<LogOut />} disabled={pending} onClick={() => setConfirming(true)} className="w-full sm:w-auto">
            Sign out everywhere
          </Button>
        }
      >
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      </AccountCard>
      <ConfirmationDialog
        open={confirming}
        title="Sign out everywhere?"
        message="Every signed-in browser and device, including this one, will be signed out immediately."
        confirmLabel="Sign out everywhere"
        loading={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          startTransition(async () => {
            setError(null);
            let result;
            try { result = await revokeAllSessions(); }
            catch { setError("Security settings are temporarily unavailable. Please try again."); return; }
            if (!result.ok) setError(result.error);
            else await signOut({ callbackUrl: "/login" });
          });
        }}
      />
    </>
  );
}
