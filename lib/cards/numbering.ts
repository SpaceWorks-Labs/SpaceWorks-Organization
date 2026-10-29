/*
 * Card number patterns, set per organisation and per member role: literal text plus tokens.
 *   {PREFIX}          the design's prefix ("SWO")
 *   {SEQ} {SEQ:4}     the running number, optionally zero-padded; required, so every registration
 *                     gets a number of its own
 *   {MEMBER} {MEMBER:4}  the member number
 *   {YYYY} {YY}       the year the card is issued, in the organisation's timezone; the running number
 *                     then restarts every year
 *   {UNIT}            the code of the member's own unit (OrgUnit.code, up to 6 characters)
 *   {U1}…{U4}         the code of the member's unit at that level, {U1} being the top level.
 *                     A member with no unit, or none at that level, prints NA. Unit codes take no
 *                     length and never split the running number: {SEQ} stays one series per design.
 * A number is given once per membership: renewals, reinstatements and reissues (a lost card, a new
 * role) keep it, and only a new registration after a membership ended takes a new one. Unit codes
 * are read when the number is made, so moving a member or renaming a code never renumbers a card.
 */

export const DEFAULT_NUMBER_FORMAT = "{PREFIX}-{SEQ:4}";
const NUMBER_FORMAT_MAX_LENGTH = 40;
export const CARD_NUMBER_MAX_LENGTH = 32;

const TOKEN = /\{(PREFIX|SEQ|MEMBER|YYYY|YY|UNIT|U[1-4])(?::([1-8]))?\}/g;
/** What a unit token prints when the member has no unit there. */
const MISSING_UNIT_CODE = "NA";
const UNIT_CODE_WIDTH = 6;
const LITERAL = /^[A-Z0-9 ./_-]*$/;

export type NumberParts = {
  prefix: string;
  seq: number;
  memberNumber: number;
  year: number;
  /** The member's own unit code. */
  unitCode?: string | null;
  /** Unit codes by level, top first: index 0 is {U1}. */
  unitCodes?: ReadonlyArray<string | null | undefined>;
};

/** Why a pattern can't be used, or null when it can. Lower-case letters are read as capitals. */
export function numberFormatError(format: string): string | null {
  const value = format.trim().toUpperCase();
  if (!value) return "Enter a card number pattern.";
  if (value.length > NUMBER_FORMAT_MAX_LENGTH) return `Keep the pattern to ${NUMBER_FORMAT_MAX_LENGTH} characters.`;
  const tokens = [...value.matchAll(TOKEN)];
  if (!tokens.some((token) => token[1] === "SEQ")) return "Include {SEQ} so every registration gets its own number.";
  if (tokens.some((token) => token[2] && token[1] !== "SEQ" && token[1] !== "MEMBER")) return "Only {SEQ} and {MEMBER} take a length, as in {SEQ:4}.";
  if (/\{U\d+(:\d+)?\}/.test(value.replace(TOKEN, ""))) return "Unit levels go from {U1}, the top level, to {U4}.";
  if (!LITERAL.test(value.replace(TOKEN, ""))) return "Use capital letters, digits, spaces and . / _ - between the tokens.";
  if (longestNumber(value) > CARD_NUMBER_MAX_LENGTH) return `Card numbers can be up to ${CARD_NUMBER_MAX_LENGTH} characters, and this pattern can make longer ones. Shorten the text around the tokens.`;
  return null;
}

/**
 * The longest number a pattern can make: a 6-character prefix and unit codes, and running and member
 * numbers of up to 7 digits.
 */
export function longestNumber(format: string) {
  return format.replace(TOKEN, (_token, name: string, width?: string) => {
    if (name === "PREFIX" || name === "UNIT" || /^U\d$/.test(name)) return "X".repeat(UNIT_CODE_WIDTH);
    if (name === "SEQ" || name === "MEMBER") return "9".repeat(Math.max(7, Number(width ?? 0)));
    return name === "YYYY" ? "2026" : "26";
  }).trim().length;
}

/** The pattern as stored: trimmed, in capitals. Call after `numberFormatError` returns null. */
export function normalizeNumberFormat(format: string) {
  return format.trim().toUpperCase();
}

/** Whether the pattern prints unit codes, so issuing needs the member's unit chain. */
export function formatUsesUnits(format: string) {
  return /\{U(NIT|[1-4])\}/.test(format);
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
    if (name === "UNIT") return parts.unitCode || MISSING_UNIT_CODE;
    if (name.startsWith("U")) return parts.unitCodes?.[Number(name.slice(1)) - 1] || MISSING_UNIT_CODE;
    return String(parts.year % 100).padStart(2, "0");
  }).trim();
}

/** The OrgCounter row a pattern's running number lives in: per role (or the organisation), per year when used. */
export function numberCounterName(scope: { roleId: string | null }, year: number | null) {
  return ["card", ...(scope.roleId ? ["role", scope.roleId] : []), ...(year ? [String(year)] : [])].join(":");
}

/** The calendar year of `now` in `timeZone`. */
export function yearIn(timeZone: string, now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(now));
}
