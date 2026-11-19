"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import QRCode from "react-qr-code";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
} from "@/app/actions/security";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { AccountCard } from "@/components/account/AccountCard";

/** Two-step verification card: authenticator enrolment, recovery codes, and disabling. */
export function AccountSecurityClient(props: { mfaEnabled: boolean }) {
  const [enabled, setEnabled] = useState(props.mfaEnabled);
  const [enrollment, setEnrollment] = useState<{
    secret: string;
    uri: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const run = (task: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      try { await task(); }
      catch { setError("Security settings are temporarily unavailable. Please try again."); }
    });

  const startEnrollment = () =>
    run(async () => {
      const result = await beginMfaEnrollment();
      if (!result.ok || !result.data)
        setError(
          result.ok ? "Could not start MFA setup." : result.error,
        );
      else setEnrollment(result.data);
    });

  return (
    <AccountCard
      id="mfa"
      title="Two-step verification"
      description="Ask for a six-digit authenticator code when you sign in with your password."
      action={enabled ? (
        <Chip size="sm" tone="success" icon={<ShieldCheck />}>On</Chip>
      ) : (
        <Chip size="sm" tone="warning" icon={<ShieldAlert />}>Off</Chip>
      )}
    >
      <div className="flex flex-col gap-4">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}

        {!enabled ? (
          <div className="flex flex-col gap-4 rounded-xl bg-warning-bg p-4 text-warning-fg sm:flex-row sm:items-center sm:p-5">
            <ShieldAlert aria-hidden className="size-5 shrink-0" />
            <p className="min-w-0 flex-1 text-body-ui">Add an authenticator app so a stolen password isn’t enough. Signing in through a linked account follows that account’s own security.</p>
            {!enrollment ? (
              <Button variant="primary" className="w-full shrink-0 sm:w-auto" disabled={pending} onClick={startEnrollment}>
                Set up authenticator
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl bg-success-bg p-4 text-success-fg sm:p-5">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
            <p className="min-w-0 flex-1 text-body-ui">Password sign-in needs a six-digit authenticator code. Signing in through a linked account follows that account’s own security.</p>
          </div>
        )}

        {recoveryCodes.length > 0 ? (
          <Callout tone="warning" title="Save these one-time recovery codes now.">
            <pre className="my-2 whitespace-pre-wrap code-text text-sm">{recoveryCodes.join("\n")}</pre>
            <Button size="sm" variant="secondary" onClick={() => void signOut({ callbackUrl: "/login" })}>
              I saved them — sign in again
            </Button>
          </Callout>
        ) : null}

        {enrollment ? (
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-subtle p-4 sm:flex-row sm:items-start sm:p-5">
            <div className="w-fit rounded-md bg-white p-3">
              <QRCode value={enrollment.uri} size={180} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className="text-body-ui text-ink-secondary">Scan the code with your authenticator app, then enter the six-digit code it shows.</p>
              <p className="break-all text-sm text-ink-secondary">
                Manual key: <span className="code-text text-ink">{enrollment.secret}</span>
              </p>
              <Field label="Six-digit code">
                <Input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" />
              </Field>
              <Button
                variant="primary"
                className="w-full sm:w-auto sm:self-start"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const result = await confirmMfaEnrollment({ code });
                    if (!result.ok || !result.data)
                      setError(
                        result.ok ? "Could not turn on two-step verification." : result.error,
                      );
                    else {
                      setEnabled(true);
                      setEnrollment(null);
                      setRecoveryCodes(result.data.recoveryCodes);
                      setCode("");
                    }
                  })
                }
              >
                Verify and turn on
              </Button>
            </div>
          </div>
        ) : null}

        {enabled && recoveryCodes.length === 0 ? (
          <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-end">
            <Field label="Authenticator or recovery code" className="sm:w-72">
              <Input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" />
            </Field>
            <Button variant="danger" disabled={pending || !code.trim()} onClick={() => setConfirming(true)}>
              Turn off two-step
            </Button>
          </div>
        ) : null}
      </div>
      <ConfirmationDialog
        open={confirming}
        title="Turn off two-step verification?"
        message="Password sign-in will no longer require an authenticator code. You will be signed out on success."
        confirmLabel="Turn off two-step"
        loading={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          run(async () => {
            const result = await disableMfa({ code });
            if (!result.ok) setError(result.error);
            else {
              setEnabled(false);
              setCode("");
              await signOut({ callbackUrl: "/login" });
            }
          });
        }}
      />
    </AccountCard>
  );
}
