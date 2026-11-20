"use server";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { CARD_DESIGN_MAX_BYTES } from "@/lib/cards/design/presets";
import { cardDesignerReadAccess } from "@/lib/cards/designerAccess";
import { CARD_TEMPLATE_LIMIT, cleanTemplateName, readOrgTemplate, templateDesign, type OrgCardTemplate } from "@/lib/cards/orgTemplates";
import type { ActionResult } from "./org";

/*
 * An organisation's own card templates, offered in the designer above the built-in ones. Reading needs
 * `cards.design`; saving and deleting change organisation settings, so they need it to write (org-wide staff).
 */

const contextFor = (organisation: { name: string }) => ({ organisationName: organisation.name, planName: "" });

const listSchema = z.object({ organisationSlug: z.string().trim().min(1) });

/** The organisation's templates, newest first. */
export async function listCardTemplates(input: unknown): Promise<ActionResult<{ templates: OrgCardTemplate[] }>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await cardDesignerReadAccess(parsed.data.organisationSlug, ["cards.design"]);
  if (!ctx.ok) return ctx;
  const rows = await prisma.cardTemplate.findMany({ where: { organisationId: ctx.organisation.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: CARD_TEMPLATE_LIMIT, select: { id: true, name: true, createdAt: true, design: true } });
  return { ok: true, data: { templates: rows.map((row) => readOrgTemplate(row, ctx.organisation.id, contextFor(ctx.organisation))) } };
}

async function writeAccess(slug: string) {
  const ctx = await orgActionAccess(slug, "cards.design");
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("action", ctx.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return ctx;
}

const saveSchema = z.object({ organisationSlug: z.string().trim().min(1), name: z.string().max(200), design: z.record(z.string(), z.unknown()) });

/** Save both sides of a design as a named organisation template. */
export async function saveCardTemplate(input: unknown): Promise<ActionResult<{ template: OrgCardTemplate }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const name = cleanTemplateName(parsed.data.name);
  if (!name) return { ok: false, error: "Give the template a name of up to 60 characters." };
  if (JSON.stringify(parsed.data.design).length > CARD_DESIGN_MAX_BYTES) return { ok: false, error: "This design is too large to save." };
  const ctx = await writeAccess(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const organisationId = ctx.organisation.id;
  const design = templateDesign(parsed.data.design, organisationId, contextFor(ctx.organisation));
  const saved = await prisma.$transaction(async (tx) => {
    // One save at a time per organisation, so the limit holds.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`card-template:${organisationId}`}))`;
    if ((await tx.cardTemplate.count({ where: { organisationId } })) >= CARD_TEMPLATE_LIMIT) return null;
    const row = await tx.cardTemplate.create({ data: { organisationId, name, design: design as unknown as Prisma.InputJsonValue, createdById: ctx.userId }, select: { id: true, name: true, createdAt: true, design: true } });
    await recordAuditEvent({ action: "CARD_TEMPLATE_SAVED", actorUserId: ctx.userId, organisationId, targetType: "CardTemplate", targetId: row.id, client: tx });
    return row;
  });
  if (!saved) return { ok: false, error: `Your organisation already has ${CARD_TEMPLATE_LIMIT} templates. Delete one first.` };
  return { ok: true, data: { template: readOrgTemplate(saved, organisationId, contextFor(ctx.organisation)) } };
}

const deleteSchema = z.object({ organisationSlug: z.string().trim().min(1), templateId: z.string().trim().min(1).max(64) });

/** Delete one of the organisation's templates. Designs made from it are unaffected. */
export async function deleteCardTemplate(input: unknown): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await writeAccess(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const organisationId = ctx.organisation.id;
  const { count } = await prisma.cardTemplate.deleteMany({ where: { id: parsed.data.templateId, organisationId } });
  if (!count) return { ok: false, error: "Not found." };
  await recordAuditEvent({ action: "CARD_TEMPLATE_DELETED", actorUserId: ctx.userId, organisationId, targetType: "CardTemplate", targetId: parsed.data.templateId });
  return { ok: true };
}
