"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent, recordThrottledAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { getPublicUrl, uploadFile } from "@/lib/storage";
import { CARD_PREFIX_PATTERN, deriveCardPrefix } from "@/lib/cards/core";
import { CARD_DESIGN_MAX_BYTES, defaultCardDesign, normalizeCardDesign } from "@/lib/cards/design/presets";
import { DEFAULT_NUMBER_FORMAT, normalizeNumberFormat, numberFormatError } from "@/lib/cards/numbering";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Card designs are organisation settings: owners and managers with organisation-wide access. */
async function access(slug: unknown) {
  const result = await orgActionAccess(slug, "org.settings");
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

/**
 * The row a design is stored in, created from the organisation default when missing. A role design
 * numbers its own cards, so it starts with a prefix made from the role's name. Two saves racing to
 * create it (two managers, or a save and an upload) hit the unique index; the loser reads the winner's row.
 */
async function designRow(organisation: { id: string; name: string }, scope: Scope, userId: string) {
  const existing = await prisma.cardDesign.findFirst({ where: rowWhere(organisation.id, scope) });
  if (existing) return existing;
  const fallback = scope.plan || scope.role ? await prisma.cardDesign.findFirst({ where: { organisationId: organisation.id, planId: null, roleId: null } }) : null;
  return prisma.cardDesign.create({
    data: {
      ...rowWhere(organisation.id, scope),
      design: (fallback?.design ?? defaultCardDesign({ organisationName: organisation.name, planName: scope.plan?.name ?? "" })) as Prisma.InputJsonValue,
      watermarkUrl: fallback?.watermarkUrl ?? null,
      numberPrefix: scope.role ? deriveCardPrefix(scope.role.name) : fallback?.numberPrefix ?? deriveCardPrefix(organisation.name),
      numberFormat: fallback?.numberFormat ?? DEFAULT_NUMBER_FORMAT,
      updatedById: userId,
    },
  }).catch(async (error: unknown) => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return prisma.cardDesign.findFirstOrThrow({ where: rowWhere(organisation.id, scope) });
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

/** Save the organisation default, one plan's or one role's own design. Autosaved by the designer. */
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
  const design = normalizeCardDesign(parsed.data.design, { organisationName: ctx.organisation.name, planName: scope.plan?.name ?? "" });
  const row = await designRow(ctx.organisation, scope, ctx.userId);
  const saved = await prisma.cardDesign.update({
    where: { id: row.id },
    data: {
      design: design as unknown as Prisma.InputJsonValue,
      updatedById: ctx.userId,
      // Numbering belongs to the organisation default and to role designs: new cards use it, reissues keep their number.
      ...(parsed.data.numberPrefix && !scope.plan ? { numberPrefix: parsed.data.numberPrefix } : {}),
      ...(parsed.data.numberFormat !== undefined && !scope.plan ? { numberFormat: normalizeNumberFormat(parsed.data.numberFormat) } : {}),
    },
  });
  await recordThrottledAuditEvent({ action: "CARD_DESIGN_SAVED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "CardDesign", targetId: saved.id, windowMs: 30 * 60_000 });
  // No revalidation: the open designer holds the state, and refreshing it would remount it mid-edit.
  return { ok: true, data: { updatedAt: saved.updatedAt.toISOString() } };
}

const revertSchema = z.object({ organisationSlug: z.string().trim().min(1), ...scopeIds }).refine((input) => Boolean(input.planId) !== Boolean(input.roleId));

/** Drop a plan's or a role's own design, so those cards use the next design down again. */
export async function revertToOrganisationCardDesign(input: unknown): Promise<ActionResult> {
  const parsed = revertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const where = parsed.data.planId ? { planId: parsed.data.planId } : { roleId: parsed.data.roleId! };
  const { count } = await prisma.cardDesign.deleteMany({ where: { organisationId: ctx.organisation.id, ...where } });
  if (count) await recordAuditEvent({ action: "CARD_DESIGN_RESET", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: parsed.data.planId ? "MembershipPlan" : "MemberRole", targetId: parsed.data.planId ?? parsed.data.roleId! });
  revalidatePath(`/dashboard/${ctx.organisation.slug}/settings/cards`);
  return { ok: true };
}

/** Upload (or, with remove=1, clear) the watermark image of a design. The designer shows it without a refresh. */
export async function uploadCardWatermark(formData: FormData): Promise<ActionResult<{ url: string | null }>> {
  const ctx = await access(String(formData.get("organisationSlug") ?? ""));
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("upload", ctx.userId)) return { ok: false, error: "Too many uploads. Please try again later." };
  const found = await scopeFor(ctx.organisation.id, String(formData.get("planId") ?? "") || null, String(formData.get("roleId") ?? "") || null);
  if (!found.ok) return found;
  const row = await designRow(ctx.organisation, found.scope, ctx.userId);
  if (formData.get("remove") === "1") {
    await prisma.cardDesign.update({ where: { id: row.id }, data: { watermarkUrl: null, updatedById: ctx.userId } });
    return { ok: true, data: { url: null } };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Choose an image of 5 MB or smaller." };
  const derivative = await createSafeWebpDerivative(file, { width: 1200, height: 1200, fit: "inside" });
  if ("error" in derivative) return { ok: false, error: derivative.error };
  try {
    const key = `organisations/${ctx.organisation.id}/member-id-watermarks/${crypto.randomUUID()}.webp`;
    await uploadFile({ key, body: derivative.body, contentType: "image/webp", organisationId: ctx.organisation.id });
    const url = getPublicUrl(key);
    await prisma.cardDesign.update({ where: { id: row.id }, data: { watermarkUrl: url, updatedById: ctx.userId } });
    await recordAuditEvent({ action: "CARD_WATERMARK_UPLOADED", actorUserId: ctx.userId, organisationId: ctx.organisation.id, targetType: "CardDesign", targetId: row.id });
    return { ok: true, data: { url } };
  } catch {
    console.error("[cards] watermark upload failed");
    return { ok: false, error: "The image didn't upload. Try again." };
  }
}
