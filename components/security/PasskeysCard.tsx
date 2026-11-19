"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { browserSupportsWebAuthn, startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { AccountCard } from "@/components/account/AccountCard";
import { passkeyBrowserMessage } from "@/components/auth/passkeyBrowser";
import { beginPasskeyRegistration, finishPasskeyRegistration } from "@/app/actions/passkeys";
import { PasskeyRow, type PasskeyItem } from "./PasskeyRow";
import { SecurityList } from "./SecurityRow";

/**
 * Passkeys on the account security page. `offered` is false when the method is off or the account is a super admin's;
 * the card then lists any existing passkeys (so they can be removed) and offers no way to add one. Props come from
 * `loadPasskeysView` (lib/views/components__security__passkeys.ts).
 */
export function PasskeysCard({ offered, passkeys }: { offered: boolean; passkeys: PasskeyItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!offered && passkeys.length === 0) return null;

  const add = () =>
    startTransition(async () => {
      setError(null);
      setMessage(null);
      if (!browserSupportsWebAuthn()) { setError("This browser can’t use passkeys."); return; }
      try {
        const begun = await beginPasskeyRegistration();
        if (!begun.ok || !begun.data) { setError(begun.ok ? "The passkey could not be added. Try again." : begun.error); return; }
        const response = await startRegistration({ optionsJSON: begun.data as PublicKeyCredentialCreationOptionsJSON });
        const finished = await finishPasskeyRegistration(response);
        if (!finished.ok) { setError(finished.error); return; }
        setMessage("Passkey added. You can rename it below.");
        router.refresh();
      } catch (caught) {
        setError(passkeyBrowserMessage(caught, "add"));
      }
    });

  return (
    <AccountCard
      id="passkeys"
      title="Passkeys"
      description="Sign in with your fingerprint, face or screen lock instead of a password. Passkeys can’t be phished."
      action={offered ? <Button variant="secondary" startIcon={<Fingerprint aria-hidden />} loading={pending} loadingLabel="Waiting for your device…" onClick={add}>Add a passkey</Button> : undefined}
    >
      <div className="flex flex-col gap-4">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        {message ? <Callout tone="success" role="status">{message}</Callout> : null}
        {!offered ? <Callout tone="info">Passkeys are switched off, so these can’t be used to sign in. You can still remove them.</Callout> : null}
        {passkeys.length ? (
          <SecurityList>
            {passkeys.map((passkey) => (
              <PasskeyRow key={passkey.id} passkey={passkey} onError={setError} onChanged={() => { setError(null); setMessage(null); router.refresh(); }} />
            ))}
          </SecurityList>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-4 py-5 text-body-ui text-ink-muted">No passkeys yet.</p>
        )}
        {offered && passkeys.length ? <p className="text-caption text-ink-muted">If you are on the team, you still enter your authenticator code after a passkey.</p> : null}
      </div>
    </AccountCard>
  );
}
