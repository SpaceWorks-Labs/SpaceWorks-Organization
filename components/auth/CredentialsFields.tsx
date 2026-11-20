"use client";

import type { FormEvent, Ref } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/field";

/**
 * The email and password fields of the sign-in and create-account forms. "Forgot password?" appears only when the
 * installation can send email (without it, a staff member or the operator resets the password).
 */
export function CredentialsFields({
  isSignUp, name, onName, email, onEmail, password, onPassword, fieldErrors, emailRef, passwordRef, loading, emailAvailable, passkeyAutofill = false, onSubmit,
}: {
  isSignUp: boolean;
  name: string;
  onName: (value: string) => void;
  email: string;
  onEmail: (value: string) => void;
  password: string;
  onPassword: (value: string) => void;
  fieldErrors: Record<string, string[]>;
  emailRef: Ref<HTMLInputElement>;
  passwordRef: Ref<HTMLInputElement>;
  loading: string | null;
  emailAvailable: boolean;
  /** Let the browser suggest passkeys in the email field (conditional UI). */
  passkeyAutofill?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      {isSignUp ? (
        <Field label="Name" required error={fieldErrors.name?.[0]}>
          <Input value={name} onChange={(e) => onName(e.target.value)} autoComplete="name" />
        </Field>
      ) : null}
      <Field label="Email" required error={fieldErrors.email?.[0]}>
        <Input ref={emailRef} type="email" value={email} onChange={(e) => onEmail(e.target.value)} autoComplete={passkeyAutofill && !isSignUp ? "email webauthn" : "email"} />
      </Field>
      <div className="relative">
        <Field label="Password" required error={fieldErrors.password?.[0]} helperText={isSignUp ? "At least 12 characters." : undefined}>
          <PasswordInput
            ref={passwordRef}
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={isSignUp ? 12 : undefined}
            maxLength={128}
          />
        </Field>
        {!isSignUp && emailAvailable ? (
          // On the label row (UX P22), with its hit area grown to 44px around the 20px label line.
          <Link href="/reset-password" className="absolute -top-3 right-0 inline-flex min-h-11 items-center px-1 text-sm font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink">
            Forgot password?
          </Link>
        ) : null}
      </div>
      <Button type="submit" variant="primary" size="lg" fullWidth disabled={!!loading} className="mt-1">
        {isSignUp ? (loading === "signup" ? "Creating account…" : "Create account") : loading === "credentials" ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
