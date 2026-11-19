"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import {
  requestPasswordReset,
  confirmPasswordReset,
} from "@/app/actions/password-reset";

export function ResetPasswordForm(props: { token: string; email: string }) {
  const { token, email: initialEmail } = props;
  const router = useRouter();
  const hasToken = Boolean(token && initialEmail);

  const [email, setEmail] = useState(initialEmail || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    startTransition(async () => {
      let res;
      try { res = await requestPasswordReset({ email }); }
      catch { setError("Password reset is temporarily unavailable. Please try again."); return; }
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      setSuccess(
        "If an account exists with that email, we've sent a password reset link. Check your inbox.",
      );
    });
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    startTransition(async () => {
      let res;
      try { res = await confirmPasswordReset({
        email: initialEmail,
        token,
        password,
      }); } catch { setError("Password reset is temporarily unavailable. Please try again."); return; }
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      setPassword("");
      setSuccess("Your password is reset. Taking you to sign in…");
      setTimeout(() => router.replace("/login"), 2000);
    });
  }

  return (
    <div className="flex w-full max-w-[440px] flex-col gap-5 rounded-xl border border-line bg-panel p-6 sm:p-8">
      <span aria-hidden className="flex size-12 items-center justify-center rounded-xl bg-sw-citron text-sw-ink [&_svg]:size-5">
        {hasToken ? <LockKeyhole /> : <KeyRound />}
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-ink">{hasToken ? "Set a new password" : "Reset password"}</h1>
        <p className="text-body-ui text-ink-secondary">
          {hasToken
            ? `For ${initialEmail}. You’ll be signed out on other devices.`
            : "Enter your email and we'll send you a link to reset your password."}
        </p>
      </div>

      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {success ? <Callout tone="success" role="status">{success}</Callout> : null}

      {hasToken ? (
        <form className="flex flex-col gap-4" onSubmit={handleReset}>
          <Field label="New password" required error={fieldErrors.password?.[0]} helperText="At least 12 characters.">
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} />
          </Field>
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
            {pending ? "Saving…" : "Save new password"}
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleRequest}>
          <Field label="Email" required error={fieldErrors.email?.[0]}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}

      <Link href="/login" className="self-center text-sm font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink">
        Back to sign in
      </Link>
    </div>
  );
}
