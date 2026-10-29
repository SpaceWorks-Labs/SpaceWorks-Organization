"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { invalidateOrg } from "@/lib/cache";
import { recordAuditEvent, recordThrottledAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { uploadFile } from "@/lib/storage";
import { pageImageUrl } from "@/lib/publicPage/sections";
import { publishPage, savePageDraft, validatePageDocument } from "@/lib/publicPage/server";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Only organisation-wide owners and managers edit the public page; unit-scoped managers can't. */
async function editor(organisationSlug: unknown) {
  const access = await orgActionAccess(organisationSlug, "org.settings");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return access;
}

/** After the live page changes: drop its cached content (lib/cache.ts) and revalidate both routes. */
async function refresh(organisation: { id: string; slug: string }) {
  await invalidateOrg(organisation.id, "public-page");
  revalidatePath(`/o/${organisation.slug}`);
  revalidatePath(`/dashboard/${organisation.slug}/settings/public-page`);
}

const documentSchema = z.object({ organisationSlug: z.string().trim().min(1).max(64), document: z.unknown() });
type Issues = { issues?: Record<string, string[]> };

/** Save the editor's work without changing what visitors see. */
export async function savePublicPageDraft(input: unknown): Promise<ActionResult<Issues>> {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await editor(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const checked = await validatePageDocument(access.organisation.id, parsed.data.document);
  if (!checked.ok) return { ok: false, error: checked.error, fieldErrors: checked.issues };
  await savePageDraft(access.organisation.id, checked.document, access.userId);
  await recordThrottledAuditEvent({ action: "PUBLIC_PAGE_DRAFT_SAVED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "Organisation", targetId: access.organisation.id, windowMs: 10 * 60_000 });
  revalidatePath(`/dashboard/${access.organisation.slug}/settings/public-page`);
  return { ok: true };
}

/** Publish the editor's document to /o/[slug]. */
export async function publishPublicPage(input: unknown): Promise<ActionResult<Issues>> {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await editor(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const checked = await validatePageDocument(access.organisation.id, parsed.data.document);
  if (!checked.ok) return { ok: false, error: checked.error, fieldErrors: checked.issues };
  await publishPage(access.organisation.id, checked.document, access.userId);
  await recordAuditEvent({ action: "PUBLIC_PAGE_PUBLISHED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "Organisation", targetId: access.organisation.id, metadata: { sections: checked.document.sections.length } });
  await refresh(access.organisation);
  return { ok: true };
}

const slugSchema = z.object({ organisationSlug: z.string().trim().min(1).max(64) });

/** Throw away unpublished changes. */
export async function discardPublicPageDraft(input: unknown): Promise<ActionResult> {
  const parsed = slugSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await editor(parsed.data.organisationSlug);
  if (!access.ok) return access;
  await prisma.organisationPage.updateMany({ where: { organisationId: access.organisation.id }, data: { draft: Prisma.DbNull } });
  revalidatePath(`/dashboard/${access.organisation.slug}/settings/public-page`);
  return { ok: true };
}

/** Take the custom page down: visitors see the plain page again. The content stays as a draft. */
export async function unpublishPublicPage(input: unknown): Promise<ActionResult> {
  const parsed = slugSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await editor(parsed.data.organisationSlug);
  if (!access.ok) return access;
  const page = await prisma.organisationPage.findUnique({ where: { organisationId: access.organisation.id } });
  if (!page?.publishedAt) return { ok: false, error: "The page isn't published." };
  const draft = page.draft ?? { tagline: page.tagline, coverAssetKey: page.coverAssetKey, accentColor: page.accentColor, sections: page.sections };
  await prisma.organisationPage.update({ where: { organisationId: page.organisationId }, data: { publishedAt: null, draft: draft as Prisma.InputJsonValue } });
  await recordAuditEvent({ action: "PUBLIC_PAGE_UNPUBLISHED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "Organisation", targetId: access.organisation.id });
  await refresh(access.organisation);
  return { ok: true };
}

/** Upload a cover or gallery image. It is re-encoded as WebP with metadata stripped. */
export async function uploadPublicPageImage(formData: FormData): Promise<ActionResult<{ key: string; url: string }>> {
  const access = await editor(String(formData.get("organisationSlug") ?? ""));
  if (!access.ok) return access;
  if (await isActionRateLimited("upload", access.userId)) return { ok: false, error: "Too many uploads. Try again later." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose an image to upload." };
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Images must be 5 MB or smaller." };
  const derivative = await createSafeWebpDerivative(file, { width: 2000, height: 2000, fit: "inside" });
  if ("error" in derivative) return { ok: false, error: derivative.error };
  try {
    const key = `organisations/${access.organisation.id}/page-images/${crypto.randomUUID()}.webp`;
    await uploadFile({ key, body: derivative.body, contentType: "image/webp", organisationId: access.organisation.id });
    await recordAuditEvent({ action: "PUBLIC_PAGE_IMAGE_UPLOADED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "Organisation", targetId: access.organisation.id });
    return { ok: true, data: { key, url: pageImageUrl(key) } };
  } catch {
    console.error("[media] public page image upload failed");
    return { ok: false, error: "Could not upload the image." };
  }
}
