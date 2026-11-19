"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Fingerprint } from "lucide-react";
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { beginPasskeySignIn } from "@/app/actions/passkey-sign-in";
import { loginErrorMessage, MfaStep } from "./MfaStep";
import { passkeyBrowserMessage } from "./passkeyBrowser";

export type PasskeyOutcome = { status: "done" } | { status: "code"; response: string } | { status: "error"; message: string | null };

/** Hand a passkey answer to Auth.js. Staff with an authenticator get `code` back and call again with it. */
export async function finishPasskeySignIn(response: string, totp?: string): Promise<PasskeyOutcome> {
  let result;
  try {
    result = await signIn("passkey", { response, ...(totp ? { totp } : {}), redirect: false });
  } catch {
    return { status: "error", message: "Sign-in is temporarily unavailable. Please refresh the page and try again." };
  }
  if (!result?.error) return { status: "done" };
  if (result.code === "mfa_required") return { status: "code", response };
  if (result.code === "address_blocked" || result.code === "throttled" || result.code === "method_disabled") return { status: "error", message: loginErrorMessage(result.code) };
  return { status: "error", message: totp ? "Invalid authenticator or recovery code. Start again with your passkey." : "That passkey could not be used. Try again, or use another option." };
}

/**
 * "Use a passkey", and, where the browser supports it, passkey suggestions in the email field's autofill
 * (conditional UI). No account is named: the device offers the passkeys it holds for this site.
 */
export function PasskeySignIn({ disabled, onOutcome }: { disabled: boolean; onOutcome: (outcome: PasskeyOutcome) => void }) {
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);
  const outcome = useRef(onOutcome);
  useEffect(() => { outcome.current = onOutcome; });

  async function run(autofill: boolean) {
    try {
      const begun = await beginPasskeySignIn();
      if (!begun.ok || !begun.data) { if (!autofill) outcome.current({ status: "error", message: begun.ok ? "The passkey could not be used. Try again." : begun.error }); return; }
      const answer = await startAuthentication({ optionsJSON: begun.data as PublicKeyCredentialRequestOptionsJSON, useBrowserAutofill: autofill });
      if (autofill) setBusy(true);
      outcome.current(await finishPasskeySignIn(JSON.stringify(answer)));
      if (autofill) setBusy(false);
    } catch (caught) {
      const message = passkeyBrowserMessage(caught, "sign-in");
      if (message && !autofill) outcome.current({ status: "error", message });
    } finally {
      if (!autofill) setBusy(false);
    }
  }

  useEffect(() => {
    // Run the conditional request once per mount; a later click aborts it and starts its own.
    void Promise.resolve(browserSupportsWebAuthn()).then(async (ok) => {
      if (!ok) return;
      setSupported(true);
      if (await browserSupportsWebAuthnAutofill()) void run(true);
    });
  }, []);

  if (!supported) return null;
  return (
    <Button variant="secondary" fullWidth startIcon={<Fingerprint aria-hidden />} loading={busy} loadingLabel="Waiting for your device…" disabled={disabled} onClick={() => { setBusy(true); void run(false); }}>
      Use a passkey
    </Button>
  );
}

/** Staff with an authenticator give its code after the passkey. A wrong code ends the attempt: the passkey starts again. */
export function PasskeyCodeStep({ response, callbackUrl, onBack }: { response: string; callbackUrl: string; onBack: (message: string | null) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <MfaStep
      email="your account"
      code={code}
      onCodeChange={setCode}
      error={null}
      verifying={busy}
      disabled={busy}
      onUseDifferentAccount={() => onBack(null)}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const result = await finishPasskeySignIn(response, code);
        if (result.status === "done") { window.location.assign(callbackUrl); return; }
        setBusy(false);
        onBack(result.status === "error" ? result.message : null);
      }}
    />
  );
}
