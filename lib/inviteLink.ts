import crypto from "crypto";
import { safeEqual } from "@/lib/safeEqual";

/**
 * Pure pieces of staff-invite sign-up (no request context): the signed cookie value and the return path.
 * The cookie is a short-lived, signed note that this browser started sign-up from one invite link. It lifts the
 * "new sign-ups are off" switch for that flow only, and only while the invite is still valid in the database
 * (lib/inviteSignup.ts). It carries no identity and grants nothing else.
 */
export const INVITE_COOKIE_TTL_MS = 30 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,256}$/;

function key() {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) throw new Error("AUTH_SECRET must be configured for invite sign-up.");
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), "spaceworks-org-invite-signup-v1", 32));
}

const sign = (body: string) => crypto.createHmac("sha256", key()).update(body).digest("base64url");

export function signInviteCookie(token: string, now = Date.now()) {
  const body = `${token}.${now + INVITE_COOKIE_TTL_MS}`;
  return `${body}.${sign(body)}`;
}

/** The invite token a cookie value vouches for, or null when it is forged, malformed or past its 30 minutes. */
export function verifyInviteCookie(value: string | undefined, now = Date.now()): string | null {
  const parts = value?.split(".");
  if (!parts || parts.length !== 3) return null;
  const [token, expires, signature] = parts;
  if (!TOKEN_PATTERN.test(token) || !/^\d{10,16}$/.test(expires)) return null;
  if (!safeEqual(sign(`${token}.${expires}`), signature)) return null;
  return Number(expires) > now ? token : null;
}

/**
 * The only post-verification return path accepted: a staff invite page on this site. Anything else is null,
 * so a verification link can never send someone elsewhere.
 */
export function inviteReturnPath(value: string | null | undefined): string | null {
  return typeof value === "string" && /^\/join\/org\/[A-Za-z0-9_-]{20,256}$/.test(value) ? value : null;
}

export const invitePath = (token: string) => `/join/org/${token}`;
