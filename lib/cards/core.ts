import { formatCalendarDate, lastValidDay } from "@/lib/membership/periods";
import { LIFETIME_VALIDITY } from "./types";

/*
 * Member card rules shared by the server, the dashboard and tests: card numbers, verify tokens and
 * printed dates. Pure functions only.
 */

/** Verify tokens are 32 random bytes, base64url: 43 characters, never guessable or enumerable. */
export const VERIFY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const CARD_PREFIX_PATTERN = /^[A-Z0-9]{2,6}$/;

/**
 * A short prefix for printed card numbers from the organisation name: the first three letters of a
 * one-word name, or the initials of the first three words.
 */
export function deriveCardPrefix(name: string) {
  const words = name.normalize("NFKD").replace(/[^A-Za-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  const prefix = (words.length === 1 ? words[0]!.slice(0, 3) : words.slice(0, 3).map((word) => word[0]).join("")).toUpperCase();
  return CARD_PREFIX_PATTERN.test(prefix) ? prefix : "M";
}

export function verifyPath(token: string) {
  return `/verify/${token}`;
}

/** The last valid day as printed ("31 Mar 2027"), or "Lifetime" for a term with no end. */
export function formatValidUntil(endsAt: Date | null | undefined, timeZone: string) {
  return endsAt ? formatCalendarDate(lastValidDay(endsAt, timeZone)) : LIFETIME_VALIDITY;
}

type CardState = "live" | "replaced" | "revoked";

export function cardState(card: { revokedAt: Date | null; revokedReason: string | null }): CardState {
  if (!card.revokedAt) return "live";
  return card.revokedReason === "REISSUED" ? "replaced" : "revoked";
}

/** Plan field answers as printable details, in field order, skipping empty ones. */
export function memberDetails(fields: Array<{ key: string; label: string; type: string }>, values: unknown) {
  const record = values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
  return fields.flatMap((field) => {
    const value = record[field.key];
    if (typeof value === "boolean") return value ? [{ key: field.key, label: field.label, value: "Yes" }] : [];
    if (typeof value !== "string" || !value.trim()) return [];
    const date = field.type === "DATE" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").map(Number) : null;
    const shown = date ? formatCalendarDate({ year: date[0]!, month: date[1]!, day: date[2]! }) : value.trim().slice(0, 200);
    return [{ key: field.key, label: field.label, value: shown }];
  });
}
