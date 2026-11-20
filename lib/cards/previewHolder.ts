import type { CardContact, CardHolder } from "./types";
import type { CardUnit } from "./units";

/*
 * The card holder the designer previews a design with when staff pick a real member. It carries only what
 * the designer may show: name, primary role, card number, units, plan, validity and a managed photo. The
 * QR never carries the member's verify token, and plan answers are sample values. Pure and client-safe.
 */

export const PREVIEW_VERIFY_TOKEN = "preview";
export const PREVIEW_VERIFY_URL = "https://example.invalid/verify/preview-card";
/** A preview search returns at most this many members. */
export const PREVIEW_SEARCH_LIMIT = 20;

export type PreviewSource = {
  name: string;
  roleName: string | null;
  planName: string | null;
  cardNumber: string | null;
  validUntil: string | null;
  units: CardUnit[];
  /** Already checked to be a managed upload (lib/cards/imageUrl.ts). */
  photoUrl: string | null;
  contact: CardContact;
  /** The plan's printable questions; their answers are sample values, never the member's own. */
  fields: ReadonlyArray<{ key: string; label: string }>;
};

/** The sample answer for a question, as the designer's sample member has. */
export function sampleAnswer(label: string) {
  return /blood/i.test(label) ? "O+" : /date|birth/i.test(label) ? "14 Feb 1998" : "Sample answer";
}

/** Build the holder, copying named fields only, so nothing else on `source` can reach the client. */
export function previewHolder(source: PreviewSource): CardHolder {
  return {
    memberId: "preview",
    verifyToken: PREVIEW_VERIFY_TOKEN,
    verifyUrl: PREVIEW_VERIFY_URL,
    displayName: source.name,
    role: source.roleName,
    planName: source.planName,
    details: source.fields.map((field) => ({ key: field.key, label: field.label, value: sampleAnswer(field.label) })),
    photoUrl: source.photoUrl,
    idNumber: source.cardNumber,
    validUntil: source.validUntil,
    units: source.units.map((unit) => ({ level: unit.level, levelName: unit.levelName, name: unit.name, code: unit.code })),
    contact: { website: source.contact.website, email: source.contact.email, phone: source.contact.phone },
  };
}

type PlanChoice = { planId: string };

/**
 * Which of the member's plans the preview shows: the design's own plan when the member has a card or term
 * on it, else their newest live card's plan, else their newest term's plan.
 */
export function previewPlanId(designPlanId: string | null, cards: readonly (PlanChoice & { issuedAt: Date })[], terms: readonly (PlanChoice & { createdAt: Date })[]): string | null {
  if (designPlanId && (cards.some((card) => card.planId === designPlanId) || terms.some((term) => term.planId === designPlanId))) return designPlanId;
  const newestCard = [...cards].sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())[0];
  if (newestCard) return newestCard.planId;
  return [...terms].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.planId ?? null;
}
