"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { loginErrorMessage } from "@/components/auth/MfaStep";

type Step = "number" | "code" | "second";

const wait = (seconds: number) => (seconds >= 120 ? `${Math.ceil(seconds / 60)} minutes` : "a minute or two");

/**
 * Sign in with a code sent by text. The answer after asking for a code is the same for every number, so it never
 * shows whether an account exists. An account with an authenticator app then asks for that code too.
 */
export function PhoneSignIn({ callbackUrl, onBack }: { callbackUrl: string; onBack: () => void }) {
  const [step, setStep] = useState<Step>("number");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [second, setSecond] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/phone/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone }) });
      if (response.status === 429) setError(`Too many codes have been asked for. Try again in ${wait(Number(response.headers.get("retry-after")) || 900)}.`);
      else if (response.status === 404) setError("Phone sign-in isn't available.");
      else if (!response.ok) setError("Enter the number with its country code, such as +91 98765 43210.");
      else {
        setMessage("If this number belongs to an account, we've sent a code. It works for 10 minutes.");
        setCode("");
        setStep("code");
      }
    } catch {
      setError("Sign-in is temporarily unavailable. Please refresh the page and try again.");
    }
    setBusy(false);
  }

  async function finish(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    let result;
    try {
      result = await signIn("phone", { phone, code, ...(step === "second" ? { totp: second } : {}), redirect: false });
    } catch {
      setBusy(false);
      setError("Sign-in is temporarily unavailable. Please refresh the page and try again.");
      return;
    }
    setBusy(false);
    if (result?.error) {
      if (result.code === "mfa_required") {
        if (step === "second") setError("That code didn't match.");
        setSecond("");
        setStep("second");
      } else if (result.code === "address_blocked" || result.code === "throttled" || result.code === "method_disabled") setError(loginErrorMessage(result.code));
      else setError(step === "second" ? "Invalid authenticator or recovery code." : "That code didn't match or has expired.");
      return;
    }
    // A full page load, so no client analytics provider survives into the signed-in page.
    window.location.assign(callbackUrl);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={step === "number" ? sendCode : finish}>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-h2 text-ink">Sign in with a phone code</h2>
        <p className="text-body-ui text-ink-secondary">{step === "second" ? "Enter the code from your authenticator app, or a recovery code." : "Use the phone number you've added to your account. We'll text you a six-digit code."}</p>
      </div>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {message && step === "code" ? <Callout tone="success" role="status">{message}</Callout> : null}
      {step === "number" ? (
        <Field label="Phone number" required helperText="Include the country code, such as +91.">
          <Input autoFocus type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" />
        </Field>
      ) : step === "code" ? (
        <Field label="Code from the text message" required>
          <Input autoFocus value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" />
        </Field>
      ) : (
        <Field label="Authenticator or recovery code" required>
          <Input autoFocus value={second} onChange={(event) => setSecond(event.target.value)} autoComplete="one-time-code" />
        </Field>
      )}
      <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy || (step === "number" ? !phone.trim() : step === "code" ? !code.trim() : !second.trim())}>
        {step === "number" ? (busy ? "Sending…" : "Send code") : busy ? "Verifying…" : "Verify and sign in"}
      </Button>
      {step === "code" ? <Button variant="quiet" className="self-center" disabled={busy} onClick={() => void sendCode()}>Send a new code</Button> : null}
      <Button variant="quiet" className="self-center" disabled={busy} onClick={onBack}>Back to sign in</Button>
    </form>
  );
}
