"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { SocialSignIn, type SingleSignOnProvider, type SocialProvider } from "@/components/auth/SocialSignIn";
import { Callout } from "@/components/ui/display";

/**
 * The sign-in view while email and password sign-in is switched off: only the outside methods, then passkey and phone
 * code (`others`). Super admins always sign in with a password, so a link opens the ordinary form for them.
 */
export function ProvidersOnlySignIn({ providers, singleSignOn = [], callbackUrl, notice, others }: { providers: SocialProvider[]; singleSignOn?: SingleSignOnProvider[]; callbackUrl: string; notice: string | null; others?: ReactNode }) {
  const [error, setError] = useState<string | null>(notice);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {providers.length === 0 && singleSignOn.length === 0 && !others ? <Callout tone="info" role="status">Sign-in isn&apos;t available right now. Ask the person who runs this site.</Callout> : null}
      <SocialSignIn
        providers={providers}
        singleSignOn={singleSignOn}
        callbackUrl={callbackUrl}
        disabled={busy}
        dividerLabel=""
        onStart={() => { setError(null); setBusy(true); }}
        onError={(text) => { setBusy(false); setError(text); }}
      />
      {others}
      <Link href="/login?admin=1" className="inline-flex min-h-11 items-center self-center px-1 text-sm text-ink-secondary underline-offset-4 hover:text-ink hover:underline">
        Super admin sign-in
      </Link>
    </div>
  );
}
