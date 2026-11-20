import "server-only";

/**
 * The relying party for passkeys: the site's own public origin, never one taken from the request. The id is that
 * origin's hostname, and the origin is checked exactly when a response is verified. A passkey is bound to this id, so
 * changing the domain makes existing passkeys unusable (people keep their other sign-in methods).
 */
export function passkeyRelyingParty(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.NEXT_PUBLIC_BASE_URL || env.AUTH_URL || (env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  const url = new URL(raw);
  return { rpID: url.hostname, origin: url.origin, rpName: "Space Works Organization" };
}

/** Challenges live five minutes and are used once. */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60_000;

/** A person may register at most this many passkeys. */
export const PASSKEYS_PER_USER = 10;
