"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent, recordThrottledAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import type { Capability } from "@/lib/permissionRoles";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { getPublicUrl, uploadFile } from "@/lib/storage";
import { approveCardDraft } from "@/lib/cards/approval";
import { CARD_PREFIX_PATTERN, deriveCardPrefix } from "@/lib/cards/core";
import { CARD_DESIGN_MAX_BYTES, defaultCardDesign, normalizeCardDesign, withOwnArtwork } from "@/lib/cards/design/presets";
import { readDraft, type CardDraft } from "@/lib/cards/draft";
import { DEFAULT_NUMBER_FORMAT, normalizeNumberFormat, numberFormatError } from "@/lib/cards/numbering";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Card designs are organisation settings: staff with `cards.design` (org-wide to change, so `orgActionAccess`
 * refuses unit staff) draft them; only the owner (`cards.approve`) puts a design on members' cards. Approval isn't
 * org-wide to change by itself, so a grant limited to one unit is still refused here.
 */
async function access(slug: unknown, capability: Capability = "cards.design") {
  const result = await orgActionAccess(slug, capability);
  if (!result.ok) return result;
  if (result.membership.unitId) return { ok: false as const, error: "Only organisation-wide managers can change card designs." };
  if (await isActionRateLimited("action", result.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return result;
}

type Scope = { plan: { id: string; name: string } | null; role: { id: string; name: string } | null };

/** Which design: the organisation default (neither id), one plan's or one member role's. */
async function scopeFor(organisationId: string, planId: string | null, roleId: string | null): Promise<{ ok: true; scope: Scope } | { ok: false; error: string }> {
  if (planId && roleId) return { ok: false, error: "Invalid request." };
  const plan = planId ? await prisma.membershipPlan.findFirst({ where: { id: planId, organisationId }, select: { id: true, name: true } }) : null;
  if (planId && !plan) return { ok: false, error: "That plan no longer exists." };
  const role = roleId ? await prisma.memberRole.findFirst({ where: { id: roleId, organisationId, archivedAt: null }, select: { id: true, name: true } }) : null;
  if (roleId && !role) return { ok: false, error: "That role no longer exists." };
  return { ok: true, scope: { plan, role } };
}

const rowWhere = (organisationId: string, scope: Scope) => ({ organisationId, planId: scope.plan?.id ?? null, roleId: scope.role?.id ?? null });
const contextFor = (organisation: { name: string }, scope: Scope) => ({ organisationName: organisation.name, planName: scope.plan?.name ?? "" });

/**
 * The row a design is stored in. A new one starts as a draft copied from the organisation's live
 * design, and stays off members' cards until it is approved. A role design numbers its own cards, so
 * it starts with a prefix made from the role's name. Two saves racing to create it hit the unique
 * index; the loser reads the winner's row.
 */
async function designRow(organisation: { id: string; name: string }, scope: Scope, userId: string) {
  const existing = await prisma.cardDesign.findFirst({ where: rowWhere(organisation.id, scope) });
  if (existing) return existing;
  const fallback = scope.plan || scope.role ? await prisma.cardDesign.findFirst({ where: { organisationId: organisation.id, planId: null, roleId: null, design: { not: Prisma.DbNull } } }) : null;
  const numberPrefix = scope.role ? deriveCardPrefix(scope.role.name) : fallback?.numberPrefix ?? deriveCardPrefix(organisation.name);
  const draft: CardDraft = {
    design: normalizeCardDesign(fallback?.design ?? defaultCardDesign(contextFor(organisation, scope)), contextFor(organisation, scope)),
    numberPrefix,
    numberFormat: fallback?.numberFormat ?? DEFAULT_NUMBER_FORMAT,
    watermarkUrl: fallback?.watermarkUrl ?? null,
  };
  return prisma.cardDesign.create({
    data: { ...rowWhere(organisation.id, scope), design: Prisma.DbNull, draft: draft as unknown as Prisma.InputJsonValue, numberPrefix, numberFormat: draft.numberFormat, updatedById: userId, draftUpdatedById: userId, draftUpdatedAt: new Date() },
  }).catch(async (error: unknown) => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return prisma.cardDesign.findFirstOrThrow({ where: rowWhere(organisation.id, scope) });
  });
}

/** Save `patch` into the row's draft, starting from the draft (or live design) already there. */
async function saveDraft(organisation: { id: string; name: string }, scope: Scope, userId: string, patch: (draft: CardDraft) => CardDraft) {
  const row = await designRow(organisation, scope, userId);
  const draft = patch(readDraft(row, contextFor(organisation, scope)));
  return prisma.cardDesign.update({
    where: { id: row.id },
    data: { draft: { ...draft, design: withOwnArtwork(draft.design, organisation.id) } as unknown as Prisma.InputJsonValue, draftUpdatedById: userId, draftUpdatedAt: new Date(), updatedById: userId },
  });
}

const scopeIds = {
  planId: z.string().trim().min(1).max(64).nullable(),
  roleId: z.string().trim().min(1).max(64).nullable().optional(),
};

const saveSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  ...scopeIds,
  design: z.record(z.string(), z.unknown()),
  numberPrefix: z.string().trim().toUpperCase().optional(),
  numberFormat: z.string().max(80).optional(),
});

/** Save the draft of the organisation default, one plan's or one role's design. Autosaved by the designer. */
export async function saveCardDesign(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  if (JSON.stringify(parsed.data.design).length > CARD_DESIGN_MAX_BYTES) return { ok: false, error: "This design is too large to save." };
  if (parsed.data.numberPrefix !== undefined && !CARD_PREFIX_PATTERN.test(parsed.data.numberPrefix)) return { ok: false, error: "Use 2 to 6 capital letters or digits for the card number prefix." };
  const formatError = parsed.data.numberFormat === undefined ? null : numberFormatError(parsed.data.numberFormat);
  if (formatError) return { ok: false, error: formatError };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const found = await scopeFor(ctx.organisation.id, parsed.data.planId, parsed.data.roleId ?? null);
  if (!found.ok) return found;
  const { scope } = found;
  if (scope.role && parsed.data.numberPrefix) {
    const own = await prisma.cardDesign.findFirst({ where: { organisationId: ctx.organisation.id, planId: null, roleId: null }, select: { numberPrefix: true } });
    if (parsed.data.numberPrefix === (own?.numberPrefix ?? deriveCardPrefix(ctx.organisation.name))) return { ok: false, error: "Give this role a prefix other than the organisation's, so its card numbers never repeat one already printed." };
  }
  const design = normalizeCardDesign(parsed.data.design, contextFor(ctx.organisation, scope));
  // Numbering belongs to the organisation default and to role designs; plans number nothing.
  const saved = await saveDraft(ctx.organisation, scope, ctx.userId, (draft) => ({
    ...draft,
    design,
    ...(parsed.data.numberPrefix && !scope.plan ? { numberPrefix: parsed.data.numberPrefix } : {}),
    ...(parsed.data.numberFormat !== undefined && !scope.plan ? { numberFormat: normalizeNumberFormat(parsed.data.numberFormat) } : {}),
  }));
  await recordThrottledAuditEvent({ action: "CARD_DESIGN_SAVED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "CardDesign", targetId: saved.id, windowMs: 30 * 60_000 });
  // No revalidation: the open designer holds the state, and refreshing it would remount it mid-edit.
  return { ok: true, data: { updatedAt: saved.updatedAt.toISOString() } };
}

const scopeSchema = z.object({ organisationSlug: z.string().trim().min(1), ...scopeIds });

/** The owner approves the draft: from now on every member's card (of this scope) is drawn from it. */
export async function approveCardDesign(input: unknown): Promise<ActionResult> {
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug, "cards.approve");
  if (!ctx.ok) return ctx;
  const found = await scopeFor(ctx.organisation.id, parsed.data.planId, parsed.data.roleId ?? null);
  if (!found.ok) return found;
  const row = await prisma.cardDesign.findFirst({ where: rowWhere(ctx.organisation.id, found.scope), select: { id: true } });
  const approved = row ? await prisma.$transaction((tx) => approveCardDraft(tx, { organisationId: ctx.organisation.id, rowId: row.id, actorUserId: ctx.userId, context: contextFor(ctx.organisation, found.scope) })) : false;
  if (!approved) return { ok: false, error: "There are no changes waiting for approval." };
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/cards`);
  return { ok: true };
}

/** Throw away the draft. A design that was never approved goes away with it. */
export async function discardCardDraft(input: unknown): Promise<ActionResult> {
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const found = await scopeFor(ctx.organisation.id, parsed.data.planId, parsed.data.roleId ?? null);
  if (!found.ok) return found;
  const where = rowWhere(ctx.organisation.id, found.scope);
  await prisma.cardDesign.deleteMany({ where: { ...where, design: { equals: Prisma.DbNull } } });
  await prisma.cardDesign.updateMany({ where: { ...where, design: { not: Prisma.DbNull } }, data: { draft: Prisma.DbNull, draftUpdatedAt: null, draftUpdatedById: null } });
  await recordAuditEvent({ action: "CARD_DESIGN_DRAFT_DISCARDED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "Organisation", targetId: ctx.organisation.id });
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/cards`);
  return { ok: true };
}

const revertSchema = scopeSchema.refine((input) => Boolean(input.planId) !== Boolean(input.roleId));

/** The owner drops a plan's or a role's own design, so those cards use the next design down again. */
export async function revertToOrganisationCardDesign(input: unknown): Promise<ActionResult> {
  const parsed = revertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug, "cards.approve");
  if (!ctx.ok) return ctx;
  const where = parsed.data.planId ? { planId: parsed.data.planId } : { roleId: parsed.data.roleId! };
  const { count } = await prisma.cardDesign.deleteMany({ where: { organisationId: ctx.organisation.id, ...where } });
  if (count) await recordAuditEvent({ action: "CARD_DESIGN_RESET", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: parsed.data.planId ? "MembershipPlan" : "MemberRole", targetId: parsed.data.planId ?? parsed.data.roleId! });
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/cards`);
  return { ok: true };
}

async function storeImage(organisationId: string, category: "member-id-watermarks" | "member-id-artwork", file: FormDataEntryValue | null, size: number) {
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES) return { ok: false as const, error: "Choose an image of 5 MB or smaller." };
  const derivative = await createSafeWebpDerivative(file, { width: size, height: size, fit: "inside" });
  if ("error" in derivative) return { ok: false as const, error: derivative.error };
  try {
    const key = `organisations/${organisationId}/${category}/${crypto.randomUUID()}.webp`;
    await uploadFile({ key, body: derivative.body, contentType: "image/webp", organisationId });
    return { ok: true as const, url: getPublicUrl(key) };
  } catch {
    console.error(`[cards] ${category} upload failed`);
    return { ok: false as const, error: "The image didn't upload. Try again." };
  }
}

/** Upload (or, with remove=1, clear) the draft's watermark image. The designer shows it without a refresh. */
export async function uploadCardWatermark(formData: FormData): Promise<ActionResult<{ url: string | null }>> {
  const ctx = await access(String(formData.get("organisationSlug") ?? ""));
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("upload", ctx.userId)) return { ok: false, error: "Too many uploads. Please try again later." };
  const found = await scopeFor(ctx.organisation.id, String(formData.get("planId") ?? "") || null, String(formData.get("roleId") ?? "") || null);
  if (!found.ok) return found;
  let url: string | null = null;
  if (formData.get("remove") !== "1") {
    const stored = await storeImage(ctx.organisation.id, "member-id-watermarks", formData.get("file"), 1200);
    if (!stored.ok) return stored;
    url = stored.url;
  }
  const saved = await saveDraft(ctx.organisation, found.scope, ctx.userId, (draft) => ({ ...draft, watermarkUrl: url }));
  if (url) await recordAuditEvent({ action: "CARD_WATERMARK_UPLOADED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "CardDesign", targetId: saved.id });
  return { ok: true, data: { url } };
}

/** Upload an image for a card layer or background. The designer puts the returned URL into the draft. */
export async function uploadCardArtwork(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const ctx = await access(String(formData.get("organisationSlug") ?? ""));
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("upload", ctx.userId)) return { ok: false, error: "Too many uploads. Please try again later." };
  const stored = await storeImage(ctx.organisation.id, "member-id-artwork", formData.get("file"), 2000);
  if (!stored.ok) return stored;
  await recordThrottledAuditEvent({ action: "CARD_ARTWORK_UPLOADED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "Organisation", targetId: ctx.organisation.id, windowMs: 30 * 60_000 });
  return { ok: true, data: { url: stored.url } };
}
