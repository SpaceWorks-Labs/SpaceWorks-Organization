/**
 * What the Supabase bridge page does when it loads. The sign-in uses PKCE: the code verifier is kept in this browser's
 * own storage when the person starts, and a returning `?code=` is exchanged only where that verifier exists. An
 * implicit-flow `#access_token=` (a URL pasted or planted from elsewhere) is never finished, and neither is a code
 * in a browser that did not start the flow, so a link cannot sign a victim into an attacker's account.
 */
export type SupabaseReturn = { action: "idle" } | { action: "exchange"; code: string } | { action: "refuse" };

export function supabaseReturn(search: string, hash: string, hasVerifier: boolean): SupabaseReturn {
  if (/access_token=/.test(hash)) return { action: "refuse" };
  const code = new URLSearchParams(search).get("code");
  if (!code) return { action: "idle" };
  return hasVerifier && /^[A-Za-z0-9._-]{8,512}$/.test(code) ? { action: "exchange", code } : { action: "refuse" };
}

/** Whether this browser holds a Supabase PKCE verifier (set by `signInWithOAuth` or `signInWithOtp` here). */
export function hasPkceVerifier(storage: Pick<Storage, "length" | "key">) {
  try {
    for (let index = 0; index < storage.length; index += 1) if (storage.key(index)?.endsWith("-code-verifier")) return true;
  } catch { /* storage is blocked: no verifier */ }
  return false;
}
