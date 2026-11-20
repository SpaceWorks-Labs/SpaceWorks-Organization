import "server-only";

import crypto from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { safeEqual } from "@/lib/safeEqual";

export type ParsedPhone = { e164: string; country: string };

/**
 * A phone number as typed, to E.164 and its country calling code. Numbers need their country code (`+91…`); a number
 * the library cannot place, or that is not a possible number for its country, is refused (null). Mobile-only is not
 * required: some countries' libraries cannot tell, and the provider refuses what it cannot reach.
 */
export function parsePhone(input: unknown): ParsedPhone | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const value = input.trim();
  if (!value.startsWith("+")) return null;
  const parsed = parsePhoneNumberFromString(value);
  if (!parsed?.isValid()) return null;
  return { e164: parsed.number, country: parsed.countryCallingCode };
}

function key(purpose: string) {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) throw new Error("AUTH_SECRET must be configured for phone codes.");
  return crypto.createHmac("sha256", secret).update(`swo:sms:${purpose}`).digest();
}

/** The keyed hash a number is stored and counted by: the same number always gives the same value, and it cannot be reversed without the secret. */
export function phoneHash(e164: string) {
  return crypto.createHmac("sha256", key("number")).update(e164).digest("hex");
}

/** The keyed hash of a code, bound to the row it was issued for, so a code cannot be moved between rows. */
export function codeHash(rowId: string, code: string) {
  return crypto.createHmac("sha256", key("code")).update(`${rowId}:${code}`).digest("hex");
}

export function hashesMatch(a: string, b: string) {
  return safeEqual(a, b, "hex");
}

/** "+91 ••••• ••210": enough for the owner to recognise their number, not enough to use it. */
export function maskPhone(e164: string) {
  return `+•• ••••• ••${e164.slice(-3)}`;
}
