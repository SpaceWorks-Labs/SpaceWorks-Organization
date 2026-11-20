"use client";

import { Suspense } from "react";
import { FirebaseBridge } from "@/components/auth/FirebaseBridge";
import { SupabaseBridge } from "@/components/auth/SupabaseBridge";
import type { FirebaseConfig, SupabaseConfig } from "@/lib/authBridges";

type Props = { provider: "supabase"; config: SupabaseConfig } | { provider: "firebase"; config: FirebaseConfig };

export function BridgeSignIn(props: Props) {
  return (
    <Suspense fallback={<p className="text-body-ui text-ink-muted">Loading sign in…</p>}>
      {props.provider === "supabase" ? <SupabaseBridge config={props.config} /> : <FirebaseBridge config={props.config} />}
    </Suspense>
  );
}
