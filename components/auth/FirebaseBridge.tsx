"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { OrDivider } from "@/components/auth/OrDivider";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { recalledCallback, rememberCallback, useBridgeFinish } from "@/components/auth/bridgeFinish";
import { safeAuthRedirect } from "@/lib/authRedirect";
import type { FirebaseConfig } from "@/lib/authBridges";

const NAMES: Record<string, string> = { "google.com": "Google", "microsoft.com": "Microsoft", "apple.com": "Apple", "github.com": "GitHub", "facebook.com": "Facebook", "twitter.com": "X", "yahoo.com": "Yahoo" };
const EMAIL_KEY = "swo.bridge.firebase-email";

async function loadAuth(config: FirebaseConfig) {
  const [{ getApps, initializeApp }, sdk] = await Promise.all([import("@firebase/app"), import("@firebase/auth")]);
  const app = getApps()[0] ?? initializeApp({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId, ...(config.appId ? { appId: config.appId } : {}) });
  return { sdk, auth: sdk.getAuth(app) };
}

/** Firebase Auth: popup providers, an email link or email and password, then the ID token goes to Auth.js. */
export function FirebaseBridge({ config }: { config: FirebaseConfig }) {
  const params = useSearchParams();
  const wanted = useMemo(() => safeAuthRedirect(params.get("callbackUrl")), [params]);
  const destination = useCallback(() => recalledCallback(wanted), [wanted]);
  const { finish, error, setError, busy, setBusy } = useBridgeFinish("firebase", destination);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const hasPassword = config.providers.includes("password");
  const hasLink = config.providers.includes("emailLink");

  const complete = useCallback(async (getToken: () => Promise<string>) => {
    const { auth, sdk } = await loadAuth(config);
    const ok = await finish(await getToken());
    await sdk.signOut(auth);
    return ok;
  }, [config, finish]);

  // Back from an emailed link.
  useEffect(() => {
    void (async () => {
      const { auth, sdk } = await loadAuth(config);
      if (!sdk.isSignInWithEmailLink(auth, window.location.href)) return;
      let address = "";
      try { address = localStorage.getItem(EMAIL_KEY) ?? ""; } catch { /* reported below */ }
      if (!address) { setError("Open the link in the browser where you asked for it."); return; }
      try { await complete(async () => (await sdk.signInWithEmailLink(auth, address, window.location.href)).user.getIdToken()); } catch { setError("That link is invalid or has expired."); }
    })();
  }, [config, complete, setError]);

  const run = async (action: () => Promise<boolean | void>) => {
    setBusy(true); setError(null);
    try { if ((await action()) !== true) setBusy(false); } catch { setBusy(false); setError("That sign-in could not be completed. Try again."); }
  };
  const popups = config.providers.filter((provider) => NAMES[provider]);

  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {sent ? <Callout tone="success" role="status">Check your inbox for a sign-in link. Open it in this browser.</Callout> : null}
      {popups.map((provider) => (
        <Button key={provider} variant="secondary" size="lg" fullWidth disabled={busy} onClick={() => run(async () => {
          const { auth, sdk } = await loadAuth(config);
          const authProvider = new sdk.OAuthProvider(provider);
          if (provider !== "twitter.com") authProvider.addScope("email");
          return complete(async () => (await sdk.signInWithPopup(auth, authProvider)).user.getIdToken());
        })}>
          Continue with {NAMES[provider]}
        </Button>
      ))}
      {popups.length > 0 && (hasPassword || hasLink) ? <OrDivider label="or with email" /> : null}
      {hasPassword || hasLink ? (
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void run(async () => {
          const { auth, sdk } = await loadAuth(config);
          if (hasPassword && password) return complete(async () => (await sdk.signInWithEmailAndPassword(auth, email, password)).user.getIdToken());
          rememberCallback(wanted);
          try { localStorage.setItem(EMAIL_KEY, email); } catch { /* the link page explains */ }
          await sdk.sendSignInLinkToEmail(auth, email, { url: `${window.location.origin}/login/bridge/firebase`, handleCodeInApp: true });
          setSent(true);
        }); }}>
          <Field label="Email" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          {hasPassword ? <Field label="Password" optional={hasLink}><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field> : null}
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy || !email}>{hasPassword && password ? "Sign in" : "Email me a sign-in link"}</Button>
        </form>
      ) : null}
    </div>
  );
}
