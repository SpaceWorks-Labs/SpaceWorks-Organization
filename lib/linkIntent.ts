import crypto from "crypto";
import { safeEqual } from "@/lib/safeEqual";

/**
 * Pure pieces of linking another sign-in method (product rules section 15, "One person, many identities"). A link
 * intent is a short-lived, signed note, set by a server action that ran inside a signed-in session, saying "this
 * browser, signed in as this user, is adding this provider". It carries the user id and the provider id, nothing
 * else, and is only ever honoured while the live session still belongs to that same user (lib/linkSession.ts).
 */
export const LINK_INTENT_TTL_MS = 10 * 60 * 1000;
export const LINK_INTENT_COOKIE = "swo.link-intent";

export type LinkIntent = { userId: string; provider: string };

const SHAPE = /^[A-Za-z0-9_-]{1,128}$/;

function key() {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) throw new Error("AUTH_SECRET must be configured for linking sign-in methods.");
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), "spaceworks-org-link-intent-v1", 32));
}

const sign = (body: string) => crypto.createHmac("sha256", key()).update(body).digest("base64url");

export function signLinkIntent(intent: LinkIntent, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ u: intent.userId, p: intent.provider, e: now + LINK_INTENT_TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The intent a cookie value vouches for, or null when it is forged, malformed or past its ten minutes. */
export function verifyLinkIntent(value: string | undefined, now = Date.now()): LinkIntent | null {
  const parts = value?.split(".");
  if (!parts || parts.length !== 2 || parts[0].length > 512) return null;
  const [body, signature] = parts;
  if (!safeEqual(sign(body), signature)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: unknown; p?: unknown; e?: unknown };
    if (typeof data.u !== "string" || typeof data.p !== "string" || typeof data.e !== "number") return null;
    if (!SHAPE.test(data.u) || !SHAPE.test(data.p) || data.e <= now) return null;
    return { userId: data.u, provider: data.p };
  } catch {
    return null;
  }
}

/** Whether a sign-in provider id belongs to an intent: the credentials-type methods report their family ("saml") only. */
export function intentCoversProvider(intent: LinkIntent, provider: string) {
  if (intent.provider === provider) return true;
  return (provider === "saml" || provider === "supabase" || provider === "firebase") && (intent.provider === provider || intent.provider.startsWith(`${provider}-`));
}
