import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JSONWebKeySet } from "jose";
import type { FirebaseConfig, SupabaseConfig } from "@/lib/authBridges";

/**
 * Verifying the tokens Firebase Auth and Supabase Auth hand the browser. Only a verified, lowercased email ever
 * becomes a local identity; phone-only and unconfirmed identities are refused.
 */
export type BridgeIdentity = { sub: string; email: string; name: string | null };
export type BridgeRefusal = "invalid_token" | "unverified_email" | "no_email" | "unsupported_signing_key" | "unavailable";
export type BridgeResult = { ok: true; identity: BridgeIdentity } | { ok: false; reason: BridgeRefusal };

export const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CLOCK_SKEW_SECONDS = 60;
const JWKS_TTL_MS = 60 * 60_000;
/** A token naming an unknown key may force a refetch at most this often, so callers can’t make us hammer the provider. */
const JWKS_REFETCH_MIN_MS = 60_000;
const MAX_TOKEN_LENGTH = 8192;

const cache = new Map<string, { keys: JSONWebKeySet; fetchedAt: number }>();
export const clearJwksCache = () => cache.clear();

async function fetchKeys(url: string, force: boolean): Promise<JSONWebKeySet> {
  const cached = cache.get(url);
  if (cached && !force && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  if (cached && force && Date.now() - cached.fetchedAt < JWKS_REFETCH_MIN_MS) return cached.keys;
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
  if (!response.ok) throw new Error("jwks");
  const keys = (await response.json()) as JSONWebKeySet;
  if (!Array.isArray(keys?.keys)) throw new Error("jwks");
  cache.set(url, { keys, fetchedAt: Date.now() });
  return keys;
}

/** Verify a signature against the provider's key set, refetching once when the token names a key we haven't seen. */
async function verify(token: string, jwksUrl: string, algorithms: string[], options: { issuer: string; audience: string }) {
  const kid = decodeProtectedHeader(token).kid;
  let keys = await fetchKeys(jwksUrl, false);
  if (kid && !keys.keys.some((key) => key.kid === kid)) keys = await fetchKeys(jwksUrl, true);
  return (await jwtVerify(token, createLocalJWKSet(keys), { ...options, algorithms, clockTolerance: CLOCK_SKEW_SECONDS })).payload;
}

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

export async function verifyFirebaseIdToken(token: string, config: Pick<FirebaseConfig, "projectId">): Promise<BridgeResult> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "invalid_token" };
  try {
    const claims = await verify(token, FIREBASE_JWKS_URL, ["RS256"], { issuer: `https://securetoken.google.com/${config.projectId}`, audience: config.projectId });
    const now = Math.floor(Date.now() / 1000);
    const sub = text(claims.sub, 128);
    const authTime = typeof claims.auth_time === "number" ? claims.auth_time : null;
    const issuedAt = typeof claims.iat === "number" ? claims.iat : null;
    if (!sub || authTime === null || issuedAt === null || authTime > now + CLOCK_SKEW_SECONDS || issuedAt > now + CLOCK_SKEW_SECONDS) return { ok: false, reason: "invalid_token" };
    const email = text(claims.email, 254)?.toLowerCase();
    if (!email) return { ok: false, reason: "no_email" };
    if (claims.email_verified !== true) return { ok: false, reason: "unverified_email" };
    return { ok: true, identity: { sub, email, name: text(claims.name, 120) } };
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.message === "jwks" ? "unavailable" : "invalid_token" };
  }
}

export async function verifySupabaseToken(token: string, config: Pick<SupabaseConfig, "url" | "anonKey">): Promise<BridgeResult> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "invalid_token" };
  try {
    // Only asymmetric signing keys are accepted; a project on the legacy shared HS256 secret is refused.
    const algorithm = decodeProtectedHeader(token).alg;
    if (!algorithm || algorithm.startsWith("HS")) return { ok: false, reason: "unsupported_signing_key" };
    const claims = await verify(token, `${config.url}/auth/v1/.well-known/jwks.json`, ["RS256", "ES256", "EdDSA"], { issuer: `${config.url}/auth/v1`, audience: "authenticated" });
    const sub = text(claims.sub, 128);
    const email = text(claims.email, 254)?.toLowerCase();
    if (!sub) return { ok: false, reason: "invalid_token" };
    if (!email) return { ok: false, reason: "no_email" };
    // The token alone does not say the address is confirmed: ask Supabase, with the user's own token.
    const response = await fetch(`${config.url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: config.anonKey }, signal: AbortSignal.timeout(5_000), cache: "no-store" });
    if (!response.ok) return { ok: false, reason: response.status >= 500 ? "unavailable" : "invalid_token" };
    const user = (await response.json()) as { id?: unknown; email?: unknown; email_confirmed_at?: unknown; user_metadata?: Record<string, unknown> };
    if (user.id !== sub || text(user.email, 254)?.toLowerCase() !== email) return { ok: false, reason: "invalid_token" };
    if (!text(user.email_confirmed_at, 64)) return { ok: false, reason: "unverified_email" };
    const meta = user.user_metadata ?? {};
    return { ok: true, identity: { sub, email, name: text(meta.full_name ?? meta.name, 120) } };
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.message === "jwks" ? "unavailable" : "invalid_token" };
  }
}
