"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";

/** The second sign-in step: an authenticator code, or a code emailed for a sign-in from a new browser. */
export function MfaStep({
  kind = "authenticator",
  email,
  code,
  onCodeChange,
  error,
  verifying,
  disabled,
  onSubmit,
  onUseDifferentAccount,
}: {
  kind?: "authenticator" | "email";
  email: string;
  code: string;
  onCodeChange: (value: string) => void;
  error: string | null;
  verifying: boolean;
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUseDifferentAccount: () => void;
}) {
  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-h2 text-ink">Verify it&apos;s you</h2>
        <p className="text-body-ui text-ink-secondary">{kind === "email" ? <>This browser is new to {email}, so we&apos;ve emailed you a six-digit code. It works for 10 minutes.</> : <>Enter the code from your authenticator app for {email}.</>}</p>
      </div>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <Field label={kind === "email" ? "Code from your email" : "Authenticator or recovery code"} required helperText={kind === "email" ? "Didn't get it? Check spam, or sign in again in a minute for a new one." : "Use a six-digit authenticator code or a recovery code."}>
        <Input autoFocus value={code} onChange={(e) => onCodeChange(e.target.value)} autoComplete="one-time-code" inputMode={kind === "email" ? "numeric" : undefined} />
      </Field>
      <Button type="submit" variant="primary" size="lg" fullWidth disabled={disabled}>
        {verifying ? "Verifying…" : "Verify and sign in"}
      </Button>
      <Button variant="quiet" className="self-center" disabled={disabled} onClick={onUseDifferentAccount}>
        Use a different account
      </Button>
    </form>
  );
}

/** Words for the error codes Auth.js and our callbacks send back to /login. */
export function loginErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "google_account_required") return "Create an account with your email and password before continuing with that provider.";
  if (code === "account_creation_disabled") return "New account creation is currently unavailable. Ask an administrator for access or sign in with an existing account.";
  if (code === "bridge_link_refused") return "An account with that email already exists here. Sign in the way you usually do; this option only signs in accounts it created.";
  if (code === "invite_email_mismatch") return "This invite can’t be used with that account. Continue with the email address the invite was sent to, or ask whoever sent it for a new one.";
  if (code === "address_blocked") return "Too many failed sign-ins from your network. Try again in an hour, or ask your administrator.";
  if (code === "super_admin_password_only") return "This is a super-admin account. Sign in with its email and password.";
  if (code === "unverified_email") return "That account's email address isn't verified with the provider. Verify it there, or sign in with your email and password.";
  if (code === "bridge_no_email") return "That sign-in has no email address, so it can’t be used here. Sign in with a method that shares a verified email.";
  if (code === "bridge_unavailable") return "That sign-in service can’t be reached or isn’t set up for this site. Try again, or use another option.";
  if (code === "bridge_failed") return "That sign-in could not be verified. Try again.";
  if (code === "method_disabled") return "That way of signing in isn’t switched on here. Use another option.";
  if (code === "throttled") return "Too many attempts. Wait a little while, then try again.";
  if (code === "link_from_account") return "An account with that email already exists here. Sign in the way you usually do; this provider can’t take over an existing account.";
  if (code === "identity_linked_elsewhere") return "That account is already linked to a different person here. Sign in with it directly, or add another account.";
  if (code === "link_failed") return "That sign-in could not be added to your account. Open Account security and try again.";
  if (code === "saml_flow") return "Start the single sign-on again from the sign-in page, in the same browser you began in.";
  if (code === "saml_failed") return "That single sign-on could not be verified. Try again, or ask whoever runs this site.";
  return "Sign-in could not be completed. Try again, or use your password and verify your email first.";
}
