/*
 * Card number patterns, set per organisation and per member role: literal text plus tokens.
 *   {PREFIX}          the design's prefix ("SWO")
 *   {SEQ} {SEQ:4}     the running number, optionally zero-padded; required, so every registration
 *                     gets a number of its own
 *   {MEMBER} {MEMBER:4}  the member number
 *   {YYYY} {YY}       the year the card is issued, in the organisation's timezone; the running number
 *                     then restarts every year
 * A number is given once per membership: renewals, reinstatements and reissues (a lost card, a new
 * role) keep it, and only a new registration after a membership ended takes a new one.
 */

export const DEFAULT_NUMBER_FORMAT = "{PREFIX}-{SEQ:4}";
export const NUMBER_FORMAT_MAX_LENGTH = 40;
export const CARD_NUMBER_MAX_LENGTH = 32;

const TOKEN = /\{(PREFIX|SEQ|MEMBER|YYYY|YY)(?::([1-8]))?\}/g;
const LITERAL = /^[A-Z0-9 ./_-]*$/;

export type NumberParts = { prefix: string; seq: number; memberNumber: number; year: number };

/** Why a pattern can't be used, or null when it can. Lower-case letters are read as capitals. */
export function numberFormatError(format: string): string | null {
  const value = format.trim().toUpperCase();
  if (!value) return "Enter a card number pattern.";
  if (value.length > NUMBER_FORMAT_MAX_LENGTH) return `Keep the pattern to ${NUMBER_FORMAT_MAX_LENGTH} characters.`;
  const tokens = [...value.matchAll(TOKEN)];
  if (!tokens.some((token) => token[1] === "SEQ")) return "Include {SEQ} so every registration gets its own number.";
  if (tokens.some((token) => token[2] && token[1] !== "SEQ" && token[1] !== "MEMBER")) return "Only {SEQ} and {MEMBER} take a length, as in {SEQ:4}.";
  if (!LITERAL.test(value.replace(TOKEN, ""))) return "Use capital letters, digits, spaces and . / _ - between the tokens.";
  return null;
}

/** The pattern as stored: trimmed, in capitals. Call after `numberFormatError` returns null. */
export function normalizeNumberFormat(format: string) {
  return format.trim().toUpperCase();
}

/** Whether the running number restarts every year. */
export function formatUsesYear(format: string) {
  return /\{YY(YY)?\}/.test(format);
}

export function formatCardNumberFrom(format: string, parts: NumberParts) {
  const pad = (value: number, width?: string) => String(value).padStart(width ? Number(width) : 0, "0");
  return format.replace(TOKEN, (_token, name: string, width?: string) => {
    if (name === "PREFIX") return parts.prefix;
    if (name === "SEQ") return pad(parts.seq, width);
    if (name === "MEMBER") return pad(parts.memberNumber, width);
    if (name === "YYYY") return String(parts.year);
    return String(parts.year % 100).padStart(2, "0");
  }).trim().slice(0, CARD_NUMBER_MAX_LENGTH);
}

/** The OrgCounter row a pattern's running number lives in: per role (or the organisation), per year when used. */
export function numberCounterName(scope: { roleId: string | null }, year: number | null) {
  return ["card", ...(scope.roleId ? ["role", scope.roleId] : []), ...(year ? [String(year)] : [])].join(":");
}

/** The calendar year of `now` in `timeZone`. */
export function yearIn(timeZone: string, now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(now));
}
