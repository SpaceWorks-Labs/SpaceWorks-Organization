import type { CardDesignContext } from "./design/normalize";
import { normalizeCardDesign, withOwnArtwork, type CardDesign } from "./design/presets";

/*
 * An organisation's own card templates (CardTemplate): both sides of a design under a name. Every read is
 * normalised again (normalizeCardSide on each side) and keeps only the organisation's own artwork. Pure and
 * client-safe.
 */

export const CARD_TEMPLATE_LIMIT = 50;
export const CARD_TEMPLATE_NAME_MAX = 60;

export type OrgCardTemplate = { id: string; name: string; createdAt: string; design: CardDesign };

/** The name as stored: trimmed, inner whitespace collapsed, 1 to 60 characters; null when empty or too long. */
export function cleanTemplateName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= CARD_TEMPLATE_NAME_MAX ? name : null;
}

/** A template's design ready to draw or apply: normalised, with only this organisation's own uploads. */
export function templateDesign(value: unknown, organisationId: string, context: CardDesignContext): CardDesign {
  return withOwnArtwork(normalizeCardDesign(value, context), organisationId);
}

export function readOrgTemplate(row: { id: string; name: string; createdAt: Date; design: unknown }, organisationId: string, context: CardDesignContext): OrgCardTemplate {
  return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString(), design: templateDesign(row.design, organisationId, context) };
}
