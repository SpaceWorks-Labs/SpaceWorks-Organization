"use client";

import { useCallback, useState } from "react";
import { signIn } from "next-auth/react";
import { loginErrorMessage } from "@/components/auth/MfaStep";
import { safeAuthRedirect } from "@/lib/authRedirect";

const KEY = "swo.bridge.callback";

/** Remember where to go after a provider redirect brings the visitor back (best effort). */
export function rememberCallback(callbackUrl: string) {
  try { sessionStorage.setItem(KEY, callbackUrl); } catch { /* the default destination is used */ }
}
export function recalledCallback(fallback: string) {
  try { return safeAuthRedirect(sessionStorage.getItem(KEY) ?? fallback); } catch { return safeAuthRedirect(fallback); }
}

/** Post a provider token to Auth.js and, on success, load the destination with a full page load. */
export function useBridgeFinish(provider: "supabase" | "firebase", callbackUrl: () => string) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const finish = useCallback(async (token: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(provider, { token, redirect: false });
      if (result?.error) {
        setError(loginErrorMessage(result.code ?? null));
        setBusy(false);
        return false;
      }
      window.location.assign(callbackUrl());
      return true;
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
      setBusy(false);
      return false;
    }
  }, [provider, callbackUrl]);
  return { finish, error, setError, busy, setBusy };
}
