"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SocialSignIn, type SingleSignOnProvider, type SocialProvider } from "@/components/auth/SocialSignIn";
import { CredentialsFields } from "@/components/auth/CredentialsFields";
import { PhoneSignIn } from "@/components/auth/PhoneSignIn";
import { ProvidersOnlySignIn } from "@/components/auth/ProvidersOnlySignIn";
import { PasskeyCodeStep, PasskeySignIn, type PasskeyOutcome } from "@/components/auth/PasskeySignIn";
import { OtherSignInMethods } from "@/components/auth/OtherSignInMethods";
import { loginErrorMessage, MfaStep } from "@/components/auth/MfaStep";
import { Callout } from "@/components/ui/display";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeAuthRedirect } from "@/lib/authRedirect";
import { resendEmailVerification, signUpWithPassword } from "@/app/actions/auth";

type Mode = "signin" | "signup";

export function LoginForm({ accountCreationEnabled, providers, singleSignOn = [], passwordEnabled, emailAvailable = true, passkeyEnabled = false, phoneEnabled = false }: { accountCreationEnabled: boolean; providers: SocialProvider[]; singleSignOn?: SingleSignOnProvider[]; passwordEnabled: boolean; emailAvailable?: boolean; passkeyEnabled?: boolean; phoneEnabled?: boolean }) {
  const sp = useSearchParams();
  const callbackUrl = useMemo(() => {
    return safeAuthRedirect(sp.get("callbackUrl"));
  }, [sp]);

  const [mode, setMode] = useState<Mode>(() =>
    accountCreationEnabled && sp.get("error") === "google_account_required" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [emailCodeRequired, setEmailCodeRequired] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(() =>
    sp.get("verified") === "1" ? "Email verified. You can now sign in." : null,
  );
  const [error, setError] = useState<string | null>(() => loginErrorMessage(sp.get("error")));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  // A passkey answer waiting for the authenticator code that staff still give.
  const [passkeyResponse, setPasskeyResponse] = useState<string | null>(null);
  const [phoneMode, setPhoneMode] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const currentCredentials = useCallback(() => {
    const currentEmail = emailInputRef.current?.value ?? email;
    const currentPassword = passwordInputRef.current?.value ?? password;
    if (currentEmail !== email) setEmail(currentEmail);
    if (currentPassword !== password) setPassword(currentPassword);
    return { email: currentEmail, password: currentPassword };
  }, [email, password]);

  useEffect(() => {
    // Browser and password-manager autofill can populate inputs without
    // dispatching an input/change event. Synchronise those DOM values so the
    // visible fields and the credentials submitted by this controlled form
    // never diverge.
    const syncAutofill = () => { currentCredentials(); };
    const animationFrame = window.requestAnimationFrame(syncAutofill);
    const timeout = window.setTimeout(syncAutofill, 250);
    window.addEventListener("pageshow", syncAutofill);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
      window.removeEventListener("pageshow", syncAutofill);
    };
  }, [currentCredentials]);

  function resetStatus() {
    setError(null);
    setMessage(null);
    setFieldErrors({});
  }

  function resetMfaChallenge() {
    setMfaRequired(false);
    setEmailCodeRequired(false);
    setTotp("");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    resetStatus();
    setLoading("credentials");
    const credentials = currentCredentials();
    let r;
    try {
      r = await signIn("credentials", {
        email: credentials.email,
        password: credentials.password,
        ...(emailCodeRequired ? { emailCode: totp } : { totp }),
        redirect: false,
      });
    } catch {
      setLoading(null);
      setError("Sign-in is temporarily unavailable. Please refresh the page and try again.");
      return;
    }
    setLoading(null);
    if (!r) {
      setError("Unexpected error. Please try again.");
      return;
    }
    if (r.error) {
      if (r.code === "mfa_required") {
        setMfaRequired(true);
        return;
      }
      if (r.code === "address_blocked" || r.code === "throttled" || r.code === "method_disabled") {
        setError(loginErrorMessage(r.code));
        return;
      }
      if (r.code === "email_code_required") {
        if (emailCodeRequired && totp) setError("That code didn't match or has expired.");
        setEmailCodeRequired(true);
        setTotp("");
        return;
      }
      if (r.code === "email_verification_required") {
        setNeedsEmailVerification(true);
        setMessage("Verify your email before signing in. You can request a new link below.");
        return;
      }
      setError(mfaRequired ? "Invalid authenticator or recovery code." : emailCodeRequired ? "That code didn't match or has expired." : "Invalid email or password.");
      return;
    }
    // A full page load, so no client analytics provider survives into the signed-in page.
    window.location.assign(callbackUrl);
  }

  async function handlePasskeyOutcome(result: PasskeyOutcome) {
    if (result.status === "done") { window.location.assign(callbackUrl); return; }
    resetStatus();
    if (result.status === "code") { setTotp(""); setPasskeyResponse(result.response); } else if (result.message) setError(result.message);
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    resetStatus();
    setLoading("signup");
    let res;
    try {
      res = await signUpWithPassword({ name, email, password });
    } catch {
      setLoading(null);
      setError("Account creation is temporarily unavailable. Please try again.");
      return;
    }
    if (!res.ok) {
      setError(res.error);
      setFieldErrors(res.fieldErrors ?? {});
      setLoading(null);
      return;
    }
    setLoading(null);
    setNeedsEmailVerification(true);
    setMessage("If this email can be registered, check your inbox for a verification link. Otherwise, sign in or reset your password.");
    setMode("signin");
    setPassword("");
  }

  async function handleResendVerification() {
    resetStatus();
    setLoading("resend-verification");
    let result;
    try {
      result = await resendEmailVerification({ email });
    } catch {
      setLoading(null);
      setError("Email delivery is temporarily unavailable. Please try again.");
      return;
    }
    setLoading(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage("If that account needs verification, a new link has been sent.");
  }

  const isSignUp = mode === "signup";
  // With passwords switched off the form is hidden, except for super admins (who always use one) through ?admin=1.
  const passwordShown = passwordEnabled || sp.get("admin") === "1";

  const otherMethods = (caption?: string | null) => (
    <OtherSignInMethods
      caption={caption}
      disabled={!!loading}
      passkey={passkeyEnabled ? <PasskeySignIn disabled={!!loading} onOutcome={handlePasskeyOutcome} /> : null}
      onPhone={phoneEnabled ? () => { resetStatus(); setPhoneMode(true); } : undefined}
    />
  );
  if (phoneMode) return <PhoneSignIn callbackUrl={callbackUrl} onBack={() => setPhoneMode(false)} />;

  if (passkeyResponse) {
    return <PasskeyCodeStep response={passkeyResponse} callbackUrl={callbackUrl} onBack={(message) => { setPasskeyResponse(null); resetStatus(); if (message) setError(message); }} />;
  }

  if (!passwordShown) {
    const others = passkeyEnabled || phoneEnabled ? otherMethods(providers.length || singleSignOn.length ? undefined : null) : null;
    return <ProvidersOnlySignIn providers={providers} singleSignOn={singleSignOn} callbackUrl={callbackUrl} notice={error} others={others} />;
  }

  if (mfaRequired || emailCodeRequired) {
    return (
      <MfaStep
        kind={emailCodeRequired ? "email" : "authenticator"}
        email={email}
        code={totp}
        onCodeChange={setTotp}
        error={error}
        verifying={loading === "credentials"}
        disabled={!!loading}
        onSubmit={handleSignIn}
        onUseDifferentAccount={() => {
          resetMfaChallenge();
          resetStatus();
        }}
      />
    );
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    resetStatus();
    resetMfaChallenge();
    setNeedsEmailVerification(false);
  };

  // UX P22 order: status, providers, the "or" divider, the fields and primary, then passkey and phone code.
  const body = (
    <>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {message ? <Callout tone="success" role="status">{message}</Callout> : null}

      {needsEmailVerification ? (
        <Button variant="secondary" className="self-start" disabled={!!loading || !email} onClick={handleResendVerification}>
          {loading === "resend-verification" ? "Sending…" : "Resend verification email"}
        </Button>
      ) : null}

      <SocialSignIn
        providers={providers}
        singleSignOn={singleSignOn}
        callbackUrl={callbackUrl}
        disabled={!!loading}
        onStart={(provider) => {
          resetStatus();
          setLoading(provider);
        }}
        onError={(text) => {
          setLoading(null);
          setError(text);
        }}
      />

      <CredentialsFields
        isSignUp={isSignUp}
        name={name}
        onName={setName}
        email={email}
        onEmail={(value) => { setEmail(value); resetMfaChallenge(); }}
        password={password}
        onPassword={(value) => { setPassword(value); resetMfaChallenge(); }}
        fieldErrors={fieldErrors}
        emailRef={emailInputRef}
        passwordRef={passwordInputRef}
        loading={loading}
        emailAvailable={emailAvailable}
        passkeyAutofill={passkeyEnabled}
        onSubmit={isSignUp ? handleSignUp : handleSignIn}
      />

      {isSignUp ? null : otherMethods()}
    </>
  );

  // Staff accounts are invited (UX S20): without self sign-up there is no Sign in | Create account switch.
  if (!accountCreationEnabled) return <div className="flex flex-col gap-4">{body}</div>;

  const trigger = "min-h-11 justify-center rounded-control border border-transparent px-4 after:hidden data-[state=active]:border-line-strong data-[state=active]:bg-panel data-[state=active]:font-semibold";
  return (
    <Tabs value={mode} onValueChange={(value) => switchMode(value as Mode)} className="flex flex-col gap-5">
      <TabsList aria-label="Sign in or create an account" className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-line bg-surface p-1">
        <TabsTrigger value="signin" className={trigger}>Sign in</TabsTrigger>
        <TabsTrigger value="signup" className={trigger}>Create account</TabsTrigger>
      </TabsList>
      <TabsContent value={mode} className="flex flex-col gap-4 pt-0">{body}</TabsContent>
    </Tabs>
  );
}
