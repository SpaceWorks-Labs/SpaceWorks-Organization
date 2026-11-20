"use server";

import { auth } from "@/lib/auth";
import { orgActionAccess } from "@/lib/permissions";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { getPublicUrl, uploadFile } from "@/lib/storage";
import { recordAuditEvent } from "@/lib/audit";
import { storeOrganisationLogo } from "@/lib/logo/store";
import { renderLogoFile } from "@/lib/logo/render";
import { validateLogoSpec } from "@/lib/logo/spec";
import { LOGO_ICON_IDS } from "@/lib/logo/icons";
import type { ActionResult } from "./org";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function imageFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File))
    return { error: "Choose an image to upload." } as const;
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES)
    return { error: "Images must be 5 MB or smaller." } as const;
  const derivative = await createSafeWebpDerivative(file, {
    width: 1200,
    height: 1200,
    fit: "inside",
  });
  return derivative;
}

/** Access, rate limit, store and audit for every way of setting an organisation logo. */
async function storeLogo(slug: unknown, action: "ORGANISATION_LOGO_UPLOADED" | "ORGANISATION_LOGO_GENERATED", file: () => Promise<unknown>): Promise<ActionResult<{ url: string }>> {
  // `org.settings` is org-wide to change: staff limited to one unit can't change the logo.
  const access = await orgActionAccess(String(slug ?? "").trim(), "org.settings");
  if (!access.ok) return access;
  if (await isActionRateLimited("upload", access.userId))
    return { ok: false, error: "Too many uploads. Try again later." };
  const org = access.organisation;
  const stored = await storeOrganisationLogo(org.id, await file());
  if (!stored.ok) return stored;
  await recordAuditEvent({ action, actorUserId: access.userId, organisationId: org.id, targetType: "Organisation", targetId: org.id });
  return { ok: true, data: { url: stored.url } };
}

export async function uploadOrganisationLogo(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  return storeLogo(formData.get("organisationSlug"), "ORGANISATION_LOGO_UPLOADED", async () => formData.get("file"));
}

/**
 * Draw a logo from the logo maker's spec on the server (text as fontkit outlines, never system fonts) and store
 * it like an upload. The profile form then saves the returned URL as the logo.
 */
export async function saveGeneratedLogo(input: { organisationSlug: string; spec: unknown }): Promise<ActionResult<{ url: string }>> {
  const parsed = validateLogoSpec(input?.spec, LOGO_ICON_IDS);
  if (!parsed.ok) return parsed;
  return storeLogo(input.organisationSlug, "ORGANISATION_LOGO_GENERATED", () => renderLogoFile(parsed.spec).catch(() => null));
}

export async function uploadAccountProfileImage(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited("upload", session.user.id))
    return { ok: false, error: "Too many uploads. Try again later." };
  const derivative = await imageFile(formData);
  if ("error" in derivative) return { ok: false, error: derivative.error };
  try {
    const key = `users/${session.user.id}/profile-images/${crypto.randomUUID()}.webp`;
    await uploadFile({
      key,
      body: derivative.body,
      contentType: "image/webp",
      userId: session.user.id,
    });
    await recordAuditEvent({
      action: "ACCOUNT_PROFILE_IMAGE_UPLOADED",
      actorUserId: session.user.id,
      targetType: "User",
      targetId: session.user.id,
    });
    return { ok: true, data: { url: getPublicUrl(key) } };
  } catch {
    console.error("[media] account profile image upload failed");
    return { ok: false, error: "Could not upload the profile image." };
  }
}
