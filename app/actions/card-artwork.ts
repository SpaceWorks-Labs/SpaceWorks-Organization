"use server";

import { recordThrottledAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { managedImageKey } from "@/lib/cards/imageUrl";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { isScopedActor, orgActionAccess } from "@/lib/permissions";
import { downloadFile, getPublicUrl, uploadFile } from "@/lib/storage";
import type { ActionResult } from "./org";

/*
 * A brand-kit logo placed on a card. Cards draw only the organisation's own `member-id-artwork`
 * uploads (withOwnArtwork), so the logo is copied into that category first, through the same safe
 * WebP derivative as any uploaded artwork. Only this organisation's own logo uploads can be copied.
 */
export async function copyLogoToCardArtwork(input: { organisationSlug: string; logoUrl: string }): Promise<ActionResult<{ url: string }>> {
  const access = await orgActionAccess(String(input?.organisationSlug ?? ""), "cards.design");
  if (!access.ok) return access;
  if (isScopedActor(access.membership)) return { ok: false, error: "Only organisation-wide managers can change card designs." };
  if (await isActionRateLimited("upload", access.userId)) return { ok: false, error: "Too many uploads. Try again later." };
  const organisationId = access.organisation.id;
  const key = managedImageKey(String(input?.logoUrl ?? ""), { kind: "organisation", organisationId, category: "organisation-logos" });
  if (!key) return { ok: false, error: "Choose one of your organisation's logos." };
  try {
    const source = await downloadFile(key);
    if (!source) return { ok: false, error: "That logo can't be found. Upload it again." };
    const derivative = await createSafeWebpDerivative(new File([Buffer.from(source.body)], "logo.webp", { type: "image/webp" }), { width: 2000, height: 2000, fit: "inside" });
    if ("error" in derivative) return { ok: false, error: derivative.error };
    const artworkKey = `organisations/${organisationId}/member-id-artwork/${crypto.randomUUID()}.webp`;
    await uploadFile({ key: artworkKey, body: derivative.body, contentType: "image/webp", organisationId });
    await recordThrottledAuditEvent({ action: "CARD_ARTWORK_UPLOADED", actorUserId: access.userId, organisationId, targetType: "Organisation", targetId: organisationId, windowMs: 30 * 60_000 });
    return { ok: true, data: { url: getPublicUrl(artworkKey) } };
  } catch {
    console.error("[cards] logo copy failed");
    return { ok: false, error: "The logo couldn't be added. Try again." };
  }
}
