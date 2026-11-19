"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BoxSpinner } from "@/components/brand/BoxSpinner";
import { Callout } from "@/components/ui/display";
import { safeAuthRedirect } from "@/lib/authRedirect";

/**
 * Finishes a SAML sign-in. The ticket rides in the URL fragment (never sent to a server or a log), is cleared from the
 * address bar at once, and is posted to Auth.js's "saml" provider, which uses it up.
 */
export function SamlFinish() {
  const search = useSearchParams();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const ticket = new URLSearchParams(window.location.hash.slice(1)).get("ticket") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    const fail = (code: string) => window.location.assign(new URL(`/login?error=${encodeURIComponent(code)}`, window.location.origin).href);
    if (!ticket) { fail("saml_failed"); return; }
    signIn("saml", { ticket, redirect: false })
      .then((result) => {
        if (result?.error) { fail(result.code && result.code !== "credentials" ? result.code : "saml_failed"); return; }
        window.location.assign(safeAuthRedirect(search.get("callbackUrl")));
      })
      .catch(() => setFailed(true));
  }, [search]);

  if (failed) {
    return (
      <div className="flex w-full max-w-[440px] flex-col items-center gap-4 text-center">
        <Callout tone="danger" role="alert" className="w-full text-left">Sign-in is temporarily unavailable. Go back to the sign-in page and try again.</Callout>
        <Link href="/login" className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink">Back to sign in</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <BoxSpinner size={24} label="Signing you in" />
      <p className="text-body-ui text-ink-secondary">Signing you in…</p>
    </div>
  );
}
