import "server-only";

import { prisma } from "@/lib/db";
import { isOrganisationUploadUrl } from "@/lib/uploadUrl";
import { BRAND_KIT_LIMITS, normalizeBrandKit, type CardBrandKit } from "./brandKit";

/**
 * An organisation's brand kit for the cards settings page. `brandKitSaved` is the stored kit (what the kit editor
 * changes); `brandKit` is what the card designer offers: the current logo first, then the kit's own logos.
 */
export async function loadCardBrandKit(organisationId: string, currentLogoUrl: string | null): Promise<{ brandKit: CardBrandKit; brandKitSaved: CardBrandKit }> {
  const row = await prisma.cardBrandKit.findUnique({ where: { organisationId }, select: { kit: true } });
  const saved = normalizeBrandKit(row?.kit, (url) => isOrganisationUploadUrl(url, organisationId, "organisation-logos"));
  const current = currentLogoUrl && isOrganisationUploadUrl(currentLogoUrl, organisationId, "organisation-logos") ? [currentLogoUrl] : [];
  const logos = [...new Set([...current, ...saved.logos])].slice(0, BRAND_KIT_LIMITS.logos + 1);
  return { brandKit: { ...saved, logos }, brandKitSaved: saved };
}
