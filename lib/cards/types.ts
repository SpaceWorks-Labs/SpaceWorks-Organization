import type { CardSideSettings } from "./design/elements";
import type { CardUnit } from "./units";

/** Everything printed about one member on one card. */
export type CardHolder = {
  memberId: string;
  /** The card's verify token. Only ever drawn inside `verifyUrl` (the QR); never log it. */
  verifyToken: string;
  /** The public check page this card's QR opens. */
  verifyUrl: string;
  displayName: string;
  /** The member's primary role ("Secretary"), if any. */
  role: string | null;
  planName: string | null;
  /** Plan field answers, keyed by plan field key. */
  details: Array<{ key: string; label: string; value: string }>;
  /** Managed (uploaded) photo only; see lib/cards/imageUrl.ts. */
  photoUrl: string | null;
  /** The printed card number, e.g. SWO-0042. */
  idNumber: string | null;
  /** The last valid day, already formatted for print ("31 Mar 2027", "Lifetime"). */
  validUntil: string | null;
  /** The member's unit and its ancestors, top level first (lib/cards/units.ts). Absent or empty: no unit. */
  units?: CardUnit[];
};

/** Organisation artwork for cards. Every URL is an application-managed upload URL. */
export type CardBranding = {
  orgAccent: string | null;
  organisationLogoUrl: string | null;
  watermarkUrl: string | null;
};

export const EMPTY_BRANDING: CardBranding = { orgAccent: null, organisationLogoUrl: null, watermarkUrl: null };

type PrintableField = { key: string; label: string; value: string };

/** The answers chosen for the card, in the chosen order, that this member actually has. */
export function printableFields(settings: Pick<CardSideSettings, "printFieldKeys">, holder: Pick<CardHolder, "details">): PrintableField[] {
  const details = new Map(holder.details.map((detail) => [detail.key, detail]));
  return settings.printFieldKeys.flatMap((key) => {
    const detail = details.get(key);
    return detail ? [{ key, label: detail.label, value: detail.value }] : [];
  });
}

/** Up to two initials for the photo placeholder. */
export function holderInitials(name: string) {
  const words = name.replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]!][0] ?? "";
  const last = words.length > 1 ? [...words[words.length - 1]!][0] ?? "" : "";
  return (first + last).toLocaleUpperCase("en");
}

/** The text an optional line prints ("No. SWO-0042"), or "" when there is nothing to print. */
export function labelledLine(label: string, value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return "";
  return label.trim() ? `${label.trim()} ${text}` : text;
}

/** What a term with no end prints in place of a date. */
export const LIFETIME_VALIDITY = "Lifetime";

/** The validity line: "Valid until 31 Mar 2027", or just "Lifetime", which reads wrong after a label. */
export function validUntilLine(label: string, value: string | null | undefined) {
  return value === LIFETIME_VALIDITY ? value : labelledLine(label, value);
}
