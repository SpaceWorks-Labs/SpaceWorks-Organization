"use client";

import { useEffect, useState } from "react";
import { startInviteSignup } from "@/app/actions/invite-acceptance";
import { signUpWithPassword } from "@/app/actions/auth";
import { SocialSignIn, type SingleSignOnProvider, type SocialProvider } from "@/components/auth/SocialSignIn";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/field";

/**
 * What a signed-out visitor sees on a staff invite: create an account, continue with a provider, or sign in.
 * Everything returns to the invite. Opening the sign-up options leaves the short-lived invite cookie that lets
 * sign-up work while new accounts are otherwise switched off.
 */
export function InviteSignup({ token, lockedEmail, providers, singleSignOn = [], passwordEnabled = true }: { token: string; lockedEmail: string | null; providers: SocialProvider[]; singleSignOn?: SingleSignOnProvider[]; passwordEnabled?: boolean }) {
  const returnPath = `/join/org/${token}`;
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [sent, setSent] = useState(false);

  useEffect(() => {
    // The server enforces the invite either way; a failure here only means sign-up may be refused later.
    startInviteSignup(token).catch(() => undefined).finally(() => setReady(true));
  }, [token]);

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy("signup");
    try {
      const started = await startInviteSignup(token);
      if (!started.ok) { setError(started.error); return; }
      const result = await signUpWithPassword({ name, email: lockedEmail ?? email, password });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setSent(true);
      setPassword("");
    } catch {
      setError("Account creation is temporarily unavailable. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (sent) {
    return (
      <Callout tone="success" role="status" className="w-full text-left">
        If this email can be registered, check your inbox for a verification link. It brings you back to this invite. If you already have an account, sign in instead.
      </Callout>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <SocialSignIn
        providers={providers}
        singleSignOn={singleSignOn}
        callbackUrl={returnPath}
        disabled={!ready || !!busy}
        onStart={(provider) => { setError(null); setBusy(provider); }}
        onError={(text) => { setBusy(null); setError(text); }}
        dividerLabel={passwordEnabled ? undefined : ""}
      />
      {passwordEnabled ? <form className="flex flex-col gap-4" onSubmit={createAccount}>
        <Field label="Name" required error={fieldErrors.name?.[0]}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field
          label="Email"
          required
          error={fieldErrors.email?.[0]}
          helperText={lockedEmail ? "This invite can only be accepted with this email address." : undefined}
        >
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" readOnly={!!lockedEmail} />
        </Field>
        <Field label="Password" required error={fieldErrors.password?.[0]} helperText="At least 12 characters.">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} />
        </Field>
        <Button type="submit" variant="primary" size="lg" fullWidth disabled={!ready || !!busy}>
          {busy === "signup" ? "Creating account…" : "Create account"}
        </Button>
      </form> : null}
      <p className="text-center text-sm text-ink-secondary">
        Already have an account?{" "}
        <button
          type="button"
          className="inline-flex min-h-11 items-center align-middle font-semibold text-ink underline underline-offset-4 hover:text-ink-secondary"
          onClick={() => { const target = `/login?callbackUrl=${encodeURIComponent(returnPath)}`; window.location.assign(new URL(target, window.location.origin).href); }}
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
