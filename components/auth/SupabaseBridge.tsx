"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { OrDivider } from "@/components/auth/OrDivider";
import { Field, Input } from "@/components/ui/field";
import { recalledCallback, rememberCallback, useBridgeFinish } from "@/components/auth/bridgeFinish";
import { hasPkceVerifier, supabaseReturn } from "@/components/auth/supabaseReturn";
import { safeAuthRedirect } from "@/lib/authRedirect";
import type { SupabaseConfig } from "@/lib/authBridges";

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Supabase Auth: an email link or the OAuth providers the project enables, then the access token goes to Auth.js. */
export function SupabaseBridge({ config }: { config: SupabaseConfig }) {
  const params = useSearchParams();
  const wanted = useMemo(() => safeAuthRedirect(params.get("callbackUrl")), [params]);
  const destination = useCallback(() => recalledCallback(wanted), [wanted]);
  const { finish, error, setError, busy, setBusy } = useBridgeFinish("supabase", destination);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const clientRef = useRef<Promise<import("@supabase/supabase-js").SupabaseClient> | null>(null);
  const client = useCallback(() => {
    clientRef.current ??= import("@supabase/supabase-js").then(({ createClient }) =>
      // PKCE: the code verifier is stored in this browser when sign-in starts (so the storage must persist across the
      // redirect), and only this browser can exchange the returning code.
      createClient(config.url, config.anonKey, { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }));
    return clientRef.current;
  }, [config]);

  // Back from Supabase's link or OAuth screen: exchange the code, but only in the browser that started the sign-in.
  useEffect(() => {
    const decision = supabaseReturn(window.location.search, window.location.hash, hasPkceVerifier(window.localStorage));
    if (decision.action === "idle") return;
    const clean = new URLSearchParams(window.location.search);
    clean.delete("code");
    const rest = clean.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    if (decision.action === "refuse") { setError("Start the sign-in again from this page, in the same browser."); return; }
    void (async () => {
      const supabase = await client();
      const { data, error: failure } = await supabase.auth.exchangeCodeForSession(decision.code);
      if (failure || !data.session) { setError("That sign-in could not be verified. Try again."); return; }
      await finish(data.session.access_token);
      await supabase.auth.signOut({ scope: "local" });
    })();
  }, [client, finish, setError]);

  const redirectTo = () => `${window.location.origin}/login/bridge/supabase`;
  const oauth = config.providers.filter((provider) => provider !== "email");

  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {sent ? <Callout tone="success" role="status">Check your inbox for a sign-in link. It brings you back here.</Callout> : null}
      {oauth.map((provider) => (
        <Button key={provider} variant="secondary" size="lg" fullWidth disabled={busy} onClick={async () => {
          setBusy(true); rememberCallback(wanted);
          const { error: failure } = await (await client()).auth.signInWithOAuth({ provider: provider as never, options: { redirectTo: redirectTo() } });
          if (failure) { setBusy(false); setError("That sign-in could not be started. Try again."); }
        }}>
          Continue with {titleCase(provider)}
        </Button>
      ))}
      {oauth.length > 0 && config.providers.includes("email") ? <OrDivider label="or with email" /> : null}
      {config.providers.includes("email") ? (
        <form className="flex flex-col gap-4" onSubmit={async (event) => {
          event.preventDefault(); setBusy(true); setError(null); rememberCallback(wanted);
          const { error: failure } = await (await client()).auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo(), shouldCreateUser: true } });
          setBusy(false);
          if (failure) setError("The sign-in link could not be sent. Check the address and try again."); else setSent(true);
        }}>
          <Field label="Email" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy || !email}>Email me a sign-in link</Button>
        </form>
      ) : null}
    </div>
  );
}
