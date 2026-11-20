import "server-only";

import crypto from "crypto";
import { safeEqual } from "@/lib/safeEqual";

/**
 * Pay links for organisations that keep records without member accounts: "Pay now" emails carry
 * /pay/<token>, which opens the pay page for one membership without signing in. The token is the term id and
 * an expiry, signed with a key derived from AUTH_SECRET, so it can't be forged or moved to another term. It
 * only ever lets someone pay (or say they've paid) what that membership owes.
 */
const VALID_DAYS = 30;

function key() {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) throw new Error("AUTH_SECRET must be configured for pay links.");
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), "spaceworks-org-pay-link-v1", 32));
}

const sign = (body: string) => crypto.createHmac("sha256", key()).update(body).digest("base64url");

export function payLinkToken(termId: string, now = Date.now()) {
  const body = `${termId}.${Math.floor(now / 1000) + VALID_DAYS * 86_400}`;
  return `${body}.${sign(body)}`;
}

/** The term a pay link is for, or null when it is malformed, forged or expired. */
export function payLinkTermId(token: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[a-z0-9]{10,40}$/i.test(parts[0]) || !/^\d{9,11}$/.test(parts[1])) return null;
  if (!safeEqual(sign(`${parts[0]}.${parts[1]}`), parts[2])) return null;
  if (Number(parts[1]) * 1000 < now) return null;
  return parts[0];
}
