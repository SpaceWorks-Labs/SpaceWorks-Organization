"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { isScopedActor, orgActionAccess } from "@/lib/permissions";
import { isOrganisationUploadUrl } from "@/lib/uploadUrl";
import { BRAND_KIT_LIMITS, normalizeBrandKit, type CardBrandKit } from "@/lib/cards/brandKit";
import { paletteFromLogoUrl } from "@/lib/cards/logoPalette";
import { storeOrganisationLogo } from "@/lib/logo/store";
import type { ActionResult } from "./org";

/**
 * The card brand kit is a card design setting: staff with `cards.design` for the whole organisation change it
 * (orgActionAccess refuses unit staff for org-wide-to-change permissions; the scoped check repeats it here).
 */
async function access(slug: unknown, bucket: "action" | "upload" = "action") {
  const result = await orgActionAccess(String(slug ?? "").trim(), "cards.design");
  if (!result.ok) return result;
  if (isScopedActor(result.membership)) return { ok: false as const, error: "Only organisation-wide managers can change the brand kit." };
  if (await isActionRateLimited(bucket, result.userId)) return { ok: false as const, error: bucket === "upload" ? "Too many uploads. Try again later." : "Too many requests. Try again shortly." };
  return result;
}

const ownLogo = (organisationId: string) => (url: string) => isOrganisationUploadUrl(url, organisationId, "organisation-logos");

async function writeKit(organisationId: string, userId: string, kit: CardBrandKit) {
  const data = { kit: kit as unknown as Prisma.InputJsonValue, updatedById: userId };
  await prisma.cardBrandKit.upsert({ where: { organisationId }, create: { organisationId, ...data }, update: data });
  await recordAuditEvent({ action: "CARD_BRAND_KIT_UPDATED", actorUserId: userId, organisationId, targetType: "Organisation", targetId: organisationId, metadata: { logos: kit.logos.length, colours: kit.colours.length, fonts: kit.fonts.length } });
}

/** Save the whole kit. Logos that aren't this organisation's own uploads, unknown fonts and bad colours are dropped. */
export async function saveCardBrandKit(input: { organisationSlug: string; kit: unknown }): Promise<ActionResult<{ kit: CardBrandKit }>> {
  const ctx = await access(input?.organisationSlug);
  if (!ctx.ok) return ctx;
  const kit = normalizeBrandKit(input.kit, ownLogo(ctx.organisation.id));
  await writeKit(ctx.organisation.id, ctx.userId, kit);
  return { ok: true, data: { kit } };
}

/**
 * Brand colours read from a logo: the organisation's current logo or one of its kit logos. Nothing is saved;
 * the colours come back for the kit editor to add.
 */
export async function extractBrandColours(input: { organisationSlug: string; logoUrl?: string | null }): Promise<ActionResult<{ colours: string[] }>> {
  const ctx = await access(input?.organisationSlug);
  if (!ctx.ok) return ctx;
  const chosen = typeof input.logoUrl === "string" && input.logoUrl ? input.logoUrl : null;
  const url = chosen ?? (await prisma.organisation.findUnique({ where: { id: ctx.organisation.id }, select: { logoUrl: true } }))?.logoUrl ?? null;
  if (!url) return { ok: false, error: "Add a logo first, in Settings → Profile." };
  if (!ownLogo(ctx.organisation.id)(url)) return { ok: false, error: "Choose one of your organisation's logos." };
  const colours = await paletteFromLogoUrl(url);
  if (colours === null) return { ok: false, error: "That logo couldn't be read. Try again." };
  if (!colours.length) return { ok: false, error: "That logo has no colours to pick, only white or transparency." };
  return { ok: true, data: { colours } };
}

/** Upload a logo variant (dark or one-colour, say) and add it to the kit. */
export async function uploadBrandKitLogo(formData: FormData): Promise<ActionResult<{ kit: CardBrandKit }>> {
  const ctx = await access(formData.get("organisationSlug"), "upload");
  if (!ctx.ok) return ctx;
  const row = await prisma.cardBrandKit.findUnique({ where: { organisationId: ctx.organisation.id }, select: { kit: true } });
  const current = normalizeBrandKit(row?.kit, ownLogo(ctx.organisation.id));
  if (current.logos.length >= BRAND_KIT_LIMITS.logos) return { ok: false, error: `A brand kit holds up to ${BRAND_KIT_LIMITS.logos} logos. Remove one first.` };
  const stored = await storeOrganisationLogo(ctx.organisation.id, formData.get("file"));
  if (!stored.ok) return stored;
  const kit = normalizeBrandKit({ ...current, logos: [...current.logos, stored.url] }, ownLogo(ctx.organisation.id));
  await writeKit(ctx.organisation.id, ctx.userId, kit);
  return { ok: true, data: { kit } };
}
