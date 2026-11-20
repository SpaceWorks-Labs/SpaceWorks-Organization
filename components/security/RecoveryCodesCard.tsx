"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { AccountCard } from "@/components/account/AccountCard";
import { regenerateRecoveryCodes } from "@/app/actions/recovery-codes";

/** Replaces the one-time recovery codes. Needs the authenticator's current code; the new set is shown once. */
export function RecoveryCodesCard({ remaining }: { remaining: number }) {
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [left, setLeft] = useState(remaining);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <AccountCard
      id="recovery-codes"
      title="Recovery codes"
      description="One-time codes for when you can't use your authenticator app. Replacing them needs a code from the app."
      action={<Chip size="sm" tone={left <= 3 ? "warning" : "neutral"}>{left} unused</Chip>}
    >
      <div className="flex flex-col gap-4">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        {codes.length > 0 ? (
          <Callout tone="warning" title="Save these new codes now. The old ones no longer work.">
            <pre className="my-2 whitespace-pre-wrap code-text text-sm">{codes.join("\n")}</pre>
            <Button size="sm" variant="secondary" onClick={() => setCodes([])}>I saved them</Button>
          </Callout>
        ) : (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                setError(null);
                let result;
                try { result = await regenerateRecoveryCodes({ code }); }
                catch { setError("Security settings are temporarily unavailable. Please try again."); return; }
                if (!result.ok) { setError(result.error); return; }
                setCodes(result.data?.recoveryCodes ?? []);
                setLeft(result.data?.recoveryCodes.length ?? 0);
                setCode("");
              });
            }}
          >
            <Field label="Authenticator code" className="sm:w-60">
              <Input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" />
            </Field>
            <Button type="submit" variant="secondary" disabled={pending || code.trim().length !== 6}>Replace recovery codes</Button>
          </form>
        )}
      </div>
    </AccountCard>
  );
}
