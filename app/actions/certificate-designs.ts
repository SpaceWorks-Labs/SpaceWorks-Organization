"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent, recordThrottledAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { isScopedActor, orgActionAccess } from "@/lib/permissions";
import type { Capability } from "@/lib/permissionRoles";
import { CARD_DESIGN_MAX_BYTES } from "@/lib/cards/design/presets";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { getPublicUrl, uploadFile } from "@/lib/storage";
import { approveCertificateDraft } from "@/lib/certificates/approval";
import {
  CERTIFICATE_PREFIX_PATTERN, certificateNumberFormatError, certificatePrefix, DEFAULT_CERTIFICATE_NUMBER_FORMAT, defaultCertificateSide,
  normalizeCertificateNumberFormat, normalizeCertificateSide, withOwnCertificateArtwork,
} from "@/lib/certificates/design";
import { readCertificateDraft, type CertificateDraft } from "@/lib/certificates/draft";
import { NAME_MAX, ORIENTATIONS, PAGE_SIZES, TYPE_LABEL_MAX } from "@/lib/certificates/pages";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** An organisation keeps at most this many certificate designs (archived ones included). */
const MAX_DESIGNS = 100;

/**
 * Certificate designs are organisation settings: staff with `certificates.design` (org-wide to change, so
 * `orgActionAccess` refuses unit staff) draft them; only the owner (`certificates.approve`) puts a design on issued
 * certificates, as with card designs.
 */
async function access(slug: unknown, capability: Capability = "certificates.design") {
  const result = await orgActionAccess(slug, capability);
  if (!result.ok) return result;
  if (isScopedActor(result.membership)) return { ok: false as const, error: "Only organisation-wide managers can change certificate designs." };
  if (await isActionRateLimited("action", result.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return result;
}

const NOT_FOUND = "That certificate design no longer exists.";
const id = z.string().trim().min(1).max(64);
const page = { pageSize: z.enum(PAGE_SIZES).optional(), orientation: z.enum(ORIENTATIONS).optional() };
const listPath = (slug: string) => `/dashboard/${slug}/certificates`;

const createSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  name: z.string().trim().min(1, "Give the design a name.").max(NAME_MAX, `Keep the name to ${NAME_MAX} characters.`),
  typeLabel: z.string().trim().max(TYPE_LABEL_MAX).optional(),
  ...page,
});

/** Start a design: a draft with the starter layout, off every certificate until the owner approves it. */
export async function createCertificateDesign(input: unknown): Promise<ActionResult<{ designId: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  if ((await prisma.certificateDesign.count({ where: { organisationId: ctx.organisation.id } })) >= MAX_DESIGNS) return { ok: false, error: `An organisation keeps up to ${MAX_DESIGNS} certificate designs. Delete one you no longer use.` };
  const pageChoice = { pageSize: parsed.data.pageSize ?? "A4", orientation: parsed.data.orientation ?? "LANDSCAPE" } as const;
  const typeLabel = parsed.data.typeLabel || parsed.data.name;
  const numberPrefix = certificatePrefix(parsed.data.name);
  const draft: CertificateDraft = { ...pageChoice, design: defaultCertificateSide({ organisationName: ctx.organisation.name }, pageChoice), numberPrefix, numberFormat: DEFAULT_CERTIFICATE_NUMBER_FORMAT, typeLabel };
  const created = await prisma.certificateDesign.create({
    data: {
      organisationId: ctx.organisation.id, name: parsed.data.name, typeLabel, ...pageChoice, numberPrefix, numberFormat: DEFAULT_CERTIFICATE_NUMBER_FORMAT,
      design: Prisma.DbNull, draft: draft as unknown as Prisma.InputJsonValue, draftUpdatedById: ctx.userId, draftUpdatedAt: new Date(), createdById: ctx.userId, updatedById: ctx.userId,
    },
  });
  await recordAuditEvent({ action: "CERTIFICATE_DESIGN_CREATED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "CertificateDesign", targetId: created.id });
  revalidatePath(listPath(ctx.organisation.slug));
  return { ok: true, data: { designId: created.id } };
}

const saveSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  designId: id,
  design: z.record(z.string(), z.unknown()).optional(),
  name: z.string().trim().min(1).max(NAME_MAX).optional(),
  typeLabel: z.string().trim().min(1).max(TYPE_LABEL_MAX).optional(),
  numberPrefix: z.string().trim().toUpperCase().optional(),
  numberFormat: z.string().max(80).optional(),
  ...page,
});

/**
 * Save the draft (autosaved by the designer). Any of the fields may be sent; the rest stay as they are. A new page
 * size or orientation re-reads the layers at the new size (positions are kept inside the page). The name is only a
 * label and changes at once.
 */
export async function saveCertificateDesign(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const data = parsed.data;
  if (data.design && JSON.stringify(data.design).length > CARD_DESIGN_MAX_BYTES) return { ok: false, error: "This design is too large to save." };
  if (data.numberPrefix !== undefined && !CERTIFICATE_PREFIX_PATTERN.test(data.numberPrefix)) return { ok: false, error: "Use 2 to 6 capital letters or digits for the certificate number prefix." };
  const formatError = data.numberFormat === undefined ? null : certificateNumberFormatError(data.numberFormat);
  if (formatError) return { ok: false, error: formatError };
  const ctx = await access(data.organisationSlug);
  if (!ctx.ok) return ctx;
  const row = await prisma.certificateDesign.findFirst({ where: { id: data.designId, organisationId: ctx.organisation.id } });
  if (!row) return { ok: false, error: NOT_FOUND };
  if (row.archivedAt) return { ok: false, error: "This design is archived. Restore it to change it." };
  const context = { organisationName: ctx.organisation.name };
  const current = readCertificateDraft(row, context);
  const pageChoice = { pageSize: data.pageSize ?? current.pageSize, orientation: data.orientation ?? current.orientation };
  const draft: CertificateDraft = {
    ...pageChoice,
    design: normalizeCertificateSide(data.design ?? current.design, context, pageChoice),
    numberPrefix: data.numberPrefix ?? current.numberPrefix,
    numberFormat: data.numberFormat === undefined ? current.numberFormat : normalizeCertificateNumberFormat(data.numberFormat),
    typeLabel: data.typeLabel ?? current.typeLabel,
  };
  const saved = await prisma.certificateDesign.update({
    where: { id: row.id },
    data: {
      draft: { ...draft, design: withOwnCertificateArtwork(draft.design, ctx.organisation.id) } as unknown as Prisma.InputJsonValue,
      draftUpdatedById: ctx.userId, draftUpdatedAt: new Date(), updatedById: ctx.userId, ...(data.name ? { name: data.name } : {}),
    },
  });
  await recordThrottledAuditEvent({ action: "CERTIFICATE_DESIGN_SAVED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "CertificateDesign", targetId: saved.id, windowMs: 30 * 60_000 });
  // No revalidation: the open designer holds the state, and refreshing it would remount it mid-edit.
  return { ok: true, data: { updatedAt: saved.updatedAt.toISOString() } };
}

const designSchema = z.object({ organisationSlug: z.string().trim().min(1), designId: id });

/** The owner approves the draft: from now on every certificate of this design is drawn from it. */
export async function approveCertificateDesign(input: unknown): Promise<ActionResult> {
  const parsed = designSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug, "certificates.approve");
  if (!ctx.ok) return ctx;
  const approved = await prisma.$transaction((tx) => approveCertificateDraft(tx, { organisationId: ctx.organisation.id, designId: parsed.data.designId, actorUserId: ctx.userId, organisationName: ctx.organisation.name }));
  if (!approved) return { ok: false, error: "There are no changes waiting for approval." };
  revalidatePath(listPath(ctx.organisation.slug));
  return { ok: true };
}

/** Throw away the draft. A design that was never approved goes away with it. */
export async function discardCertificateDraft(input: unknown): Promise<ActionResult> {
  const parsed = designSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const where = { id: parsed.data.designId, organisationId: ctx.organisation.id };
  await prisma.certificateDesign.deleteMany({ where: { ...where, design: { equals: Prisma.DbNull }, certificates: { none: {} } } });
  await prisma.certificateDesign.updateMany({ where: { ...where, design: { not: Prisma.DbNull } }, data: { draft: Prisma.DbNull, draftUpdatedAt: null, draftUpdatedById: null } });
  await recordAuditEvent({ action: "CERTIFICATE_DESIGN_DRAFT_DISCARDED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "CertificateDesign", targetId: parsed.data.designId });
  revalidatePath(listPath(ctx.organisation.slug));
  return { ok: true };
}

/**
 * Delete a design nothing was ever issued from. One with certificates is archived instead (they keep their design,
 * and stay downloadable and verifiable); `archived` says which happened.
 */
export async function deleteCertificateDesign(input: unknown): Promise<ActionResult<{ archived: boolean }>> {
  const parsed = designSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const row = await prisma.certificateDesign.findFirst({ where: { id: parsed.data.designId, organisationId: ctx.organisation.id }, select: { id: true } });
  if (!row) return { ok: false, error: NOT_FOUND };
  const issued = await prisma.certificate.count({ where: { organisationId: ctx.organisation.id, designId: row.id } });
  if (issued === 0) await prisma.certificateDesign.deleteMany({ where: { id: row.id, organisationId: ctx.organisation.id } });
  else await prisma.certificateDesign.updateMany({ where: { id: row.id, organisationId: ctx.organisation.id }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
  await recordAuditEvent({ action: issued === 0 ? "CERTIFICATE_DESIGN_DELETED" : "CERTIFICATE_DESIGN_ARCHIVED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "CertificateDesign", targetId: row.id });
  revalidatePath(listPath(ctx.organisation.slug));
  return { ok: true, data: { archived: issued > 0 } };
}

/** Bring an archived design back. */
export async function restoreCertificateDesign(input: unknown): Promise<ActionResult> {
  const parsed = designSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { count } = await prisma.certificateDesign.updateMany({ where: { id: parsed.data.designId, organisationId: ctx.organisation.id, archivedAt: { not: null } }, data: { archivedAt: null, updatedById: ctx.userId } });
  if (count === 0) return { ok: false, error: NOT_FOUND };
  await recordAuditEvent({ action: "CERTIFICATE_DESIGN_RESTORED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "CertificateDesign", targetId: parsed.data.designId });
  revalidatePath(listPath(ctx.organisation.slug));
  return { ok: true };
}

/**
 * Upload an image for a certificate layer or background. It is stored with the organisation's `member-id-artwork`
 * uploads, the only images designs may draw; the designer puts the returned URL into the draft.
 */
export async function uploadCertificateArtwork(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const ctx = await access(String(formData.get("organisationSlug") ?? ""));
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("upload", ctx.userId)) return { ok: false, error: "Too many uploads. Try again later." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Choose an image of 5 MB or smaller." };
  const derivative = await createSafeWebpDerivative(file, { width: 3600, height: 3600, fit: "inside" });
  if ("error" in derivative) return { ok: false, error: derivative.error };
  try {
    const key = `organisations/${ctx.organisation.id}/member-id-artwork/${crypto.randomUUID()}.webp`;
    await uploadFile({ key, body: derivative.body, contentType: "image/webp", organisationId: ctx.organisation.id });
    await recordThrottledAuditEvent({ action: "CERTIFICATE_ARTWORK_UPLOADED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "Organisation", targetId: ctx.organisation.id, windowMs: 30 * 60_000 });
    return { ok: true, data: { url: getPublicUrl(key) } };
  } catch {
    console.error("[certificates] artwork upload failed");
    return { ok: false, error: "The image didn't upload. Try again." };
  }
}
