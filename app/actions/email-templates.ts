"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { sendBrandedEmail } from "@/lib/email/message";
import { EMAIL_TEMPLATE_KINDS, renderEmailTemplate, sampleValues, TEMPLATE_LIMITS } from "@/lib/email/templates";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

/*
 * An organisation's own wording for member emails (Settings → Email). Changing it needs the organisation's
 * settings permission held for the whole organisation, and every change is audited.
 */

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const base = z.object({ organisationSlug: z.string().trim().min(1).max(64), kind: z.enum(EMAIL_TEMPLATE_KINDS) });
const text = (label: string, max: number) => z.string().trim().min(1, `Add the ${label}`).max(max, `Keep it to ${max} characters`);
const templateSchema = base.extend({
  subject: text("subject", TEMPLATE_LIMITS.subject),
  heading: text("heading", TEMPLATE_LIMITS.heading),
  body: z.string().transform((value) => value.replace(/\r\n?/g, "\n")).pipe(text("text", TEMPLATE_LIMITS.body)),
});

async function access(slug: string) {
  const ctx = await orgActionAccess(slug, "org.settings");
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("action", ctx.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return ctx;
}

const refresh = (slug: string) => revalidatePath(`/dashboard/${slug}/settings/email`);

/** Save the wording for one kind of member email. */
export async function saveEmailTemplate(input: unknown): Promise<ActionResult> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { kind, subject, heading, body } = parsed.data;
  const values = { subject, heading, body };
  const organisationId = ctx.organisation.id;
  await prisma.$transaction(async (tx) => {
    await tx.orgEmailTemplate.upsert({ where: { organisationId_kind: { organisationId, kind } }, create: { organisationId, kind, ...values, updatedById: ctx.userId }, update: { ...values, updatedById: ctx.userId } });
    await recordAuditEvent({ action: "ORG_EMAIL_TEMPLATE_SAVED", actorUserId: ctx.userId, organisationId, targetType: "Organisation", targetId: organisationId, metadata: { kind }, client: tx });
  });
  refresh(ctx.organisation.slug);
  return { ok: true };
}

/** Go back to the standard wording: the saved template is deleted. */
export async function resetEmailTemplate(input: unknown): Promise<ActionResult> {
  const parsed = base.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const organisationId = ctx.organisation.id;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.orgEmailTemplate.deleteMany({ where: { organisationId, kind: parsed.data.kind } });
    if (count) await recordAuditEvent({ action: "ORG_EMAIL_TEMPLATE_RESET", actorUserId: ctx.userId, organisationId, targetType: "Organisation", targetId: organisationId, metadata: { kind: parsed.data.kind }, client: tx });
  });
  refresh(ctx.organisation.slug);
  return { ok: true };
}

/**
 * Send the wording as it is in the editor (saved or not), filled in with sample details, to the editor's own
 * verified email address, through the organisation's email route.
 */
export async function sendEmailTemplateTest(input: unknown): Promise<ActionResult> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  if (await isActionRateLimited("testEmail", ctx.userId)) return { ok: false, error: "You've sent several tests. Try again in an hour." };
  const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { email: true, emailVerified: true } });
  if (!user?.email || !user.emailVerified) return { ok: false, error: "Verify your own email address first." };
  const content = renderEmailTemplate(parsed.data, sampleValues(ctx.organisation.name));
  try {
    await sendBrandedEmail({ organisationId: ctx.organisation.id, to: user.email, ...content, subject: `Test: ${content.subject}` });
  } catch {
    return { ok: false, error: "The test couldn't be sent. Check the email settings above and try again." };
  }
  return { ok: true };
}
