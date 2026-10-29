"use server";

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { enqueueOutbox } from "@/lib/outbox";
import { orgActionAccess } from "@/lib/permissions";
import { MembershipError, openTerm, upsertMember } from "@/lib/membership/service";
import { MEMBERSHIP_NOTICE_VERSION, memberProfileSchema, validateFieldValues } from "@/lib/membership/validators";
import { teamScope, unitInScope } from "@/lib/membership/scope";
import { planOffersUnit } from "@/lib/membership/planUnits";
import { loadPaymentGuidance } from "@/lib/payments/payGuidance";
import { payLinkToken } from "@/lib/payments/payLink";
import type { PaymentGuidance } from "@/lib/payments/unitInstructions";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const joinSchema = z.object({
  organisationSlug: z.string().trim().min(1).max(64),
  planSlug: z.string().trim().min(1).max(64),
  inviteToken: z.string().trim().max(128).optional().nullable(),
  consent: z.literal(true, { error: "Agree to the privacy notice to join" }),
  profile: z.unknown(),
});

/** Is an invite usable now, by this email? */
function inviteUsable(invite: { usedOut: boolean; revokedAt: Date | null; expiresAt: Date | null; email: string | null }, email: string) {
  if (invite.usedOut || invite.revokedAt || (invite.expiresAt && invite.expiresAt <= new Date())) return false;
  return !invite.email || invite.email === email;
}

/**
 * Join an organisation on a plan. The account's verified email becomes the member's email, so one person
 * holds one member record per organisation and can see all of them from their account.
 */
export async function submitJoin(input: unknown): Promise<ActionResult<{ status: string; termId: string; payment: PaymentGuidance | null; payUrl: string | null; accountUrl: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in to join." };
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  if (!user?.email || !user.emailVerified) return { ok: false, error: "Verify your email address before joining." };
  const email = user.email.toLowerCase();

  const org = await prisma.organisation.findUnique({ where: { slug: parsed.data.organisationSlug }, select: { id: true, slug: true, status: true, timezone: true, financialYearStartMonth: true, memberLimit: true, unitLevels: true, memberPortal: true } });
  if (!org || org.status !== "ACTIVE") return { ok: false, error: "This organisation isn't taking members right now." };
  const plan = await prisma.membershipPlan.findFirst({ where: { organisationId: org.id, slug: parsed.data.planSlug, archivedAt: null }, include: { fields: true, units: { select: { unit: { select: { path: true } } } } } });
  if (!plan) return { ok: false, error: "That plan is no longer offered." };

  const invite = parsed.data.inviteToken
    ? await prisma.memberInvite.findFirst({ where: { token: parsed.data.inviteToken, planId: plan.id } })
    : null;
  const inviteOk = invite ? inviteUsable({ ...invite, usedOut: invite.uses >= invite.maxUses }, email) : false;
  if (parsed.data.inviteToken && !inviteOk) return { ok: false, error: "This invite has expired, been used, or is for a different email address." };
  if ((plan.joinMode === "INVITE_ONLY" || plan.joinMode === "CLOSED") && !inviteOk) {
    return { ok: false, error: plan.joinMode === "CLOSED" ? "This plan isn't taking new members." : "This plan is by invitation only." };
  }

  // Joining never moves an existing member: their unit wins over the invite's and the form's.
  const existing = await prisma.member.findUnique({ where: { organisationId_email: { organisationId: org.id, email } }, select: { unitId: true } });
  const profile = memberProfileSchema.safeParse({ ...(parsed.data.profile as object), email, unitId: existing?.unitId ?? invite?.unitId ?? (parsed.data.profile as { unitId?: string })?.unitId });
  if (!profile.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(profile.error) };
  const answers = validateFieldValues(plan.fields, profile.data.fieldValues, false);
  if (Object.keys(answers.errors).length) return { ok: false, error: "Answer the questions marked as required.", fieldErrors: answers.errors };

  const unitId = profile.data.unitId;
  if (org.unitLevels.length > 0 && !unitId) return { ok: false, error: "Choose your unit.", fieldErrors: { unitId: ["Choose your unit"] } };
  if (unitId) {
    const unit = await prisma.orgUnit.findFirst({ where: { organisationId: org.id, id: unitId, ...(existing?.unitId ? {} : { archivedAt: null }) }, select: { path: true } });
    if (!unit) return { ok: false, error: "Choose your unit.", fieldErrors: { unitId: ["Choose another unit"] } };
    if (!planOffersUnit(plan, plan.units.map((entry) => entry.unit.path), unit.path)) return { ok: false, error: "This plan isn't offered in your unit.", fieldErrors: { unitId: ["Not offered here"] } };
  }
  if (await isActionRateLimited("join", userId)) return { ok: false, error: "Too many attempts. Try again later." };

  try {
    const term = await prisma.$transaction(async (tx) => {
      if (org.memberLimit && (await tx.member.count({ where: { organisationId: org.id } })) >= org.memberLimit) {
        const existing = await tx.member.count({ where: { organisationId: org.id, email } });
        if (!existing) throw new MembershipError("This organisation is full for now. Contact them directly.");
      }
      const member = await upsertMember(tx, org.id, { ...profile.data, unitId, keepExistingUnit: true, userId, fieldValues: answers.values, source: "JOIN_FORM" });
      await tx.consentRecord.create({ data: { organisationId: org.id, memberId: member.id, purpose: "membership", noticeVersion: MEMBERSHIP_NOTICE_VERSION, byGuardian: profile.data.isMinor } });
      // An invite stands in for approval: the organisation already chose this person.
      const opened = await openTerm(tx, { org, plan, memberId: member.id, byManager: inviteOk, actorUserId: userId });
      if (invite && inviteOk) {
        const claimed = await tx.memberInvite.updateMany({ where: { id: invite.id, uses: { lt: invite.maxUses } }, data: { uses: { increment: 1 } } });
        if (claimed.count !== 1) throw new MembershipError("This invite was just used up.");
      }
      return opened;
    });
    revalidatePath(`/dashboard/${org.slug}/members`);
    // How to pay offline, from the member's unit up to the organisation, for the confirmation.
    const unitPath = term.status === "PENDING_PAYMENT" ? (await prisma.member.findUnique({ where: { id: term.memberId }, select: { unit: { select: { path: true } } } }))?.unit?.path : null;
    const payment = term.status === "PENDING_PAYMENT" ? await loadPaymentGuidance(org.id, unitPath, term.currency) : null;
    // Without member accounts there is no account to pay from: a signed pay link instead (lib/payments/payLink.ts).
    const payUrl = term.status !== "PENDING_PAYMENT" ? null : org.memberPortal ? `/account/pay/${term.id}` : `/pay/${payLinkToken(term.id)}`;
    return { ok: true, data: { status: term.status, termId: term.id, payment, payUrl, accountUrl: org.memberPortal ? "/account" : `/o/${org.slug}` } };
  } catch (error) {
    if (error instanceof MembershipError) return { ok: false, error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "You already have an application or unpaid membership on this plan. See your account." };
    throw error;
  }
}

const inviteSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  planId: z.string().trim().min(1).max(64),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320).optional().or(z.literal("")).transform((value) => value || null),
  unitId: z.string().trim().max(64).optional().nullable().transform((value) => value || null),
  maxUses: z.coerce.number().int().min(1).max(10_000).default(1),
  expiresInDays: z.coerce.number().int().min(1).max(365).default(30),
});

/** Create a join invite for a plan: personal (bound to an email, emailed) or a shared link with a use limit. */
export async function createMemberInvite(input: unknown): Promise<ActionResult<{ token: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await orgActionAccess(parsed.data.organisationSlug, "members.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("invite", access.userId)) return { ok: false, error: "Too many invites. Try again later." };
  const plan = await prisma.membershipPlan.findFirst({ where: { id: parsed.data.planId, organisationId: access.organisation.id, archivedAt: null }, select: { id: true } });
  if (!plan) return { ok: false, error: "That plan is no longer offered." };
  const scope = await teamScope(access.organisation.id, access.membership.unitId);
  const unit = parsed.data.unitId ? await prisma.orgUnit.findFirst({ where: { organisationId: access.organisation.id, id: parsed.data.unitId }, select: { path: true } }) : null;
  if (parsed.data.unitId && !unit) return { ok: false, error: "That unit no longer exists." };
  if (!unitInScope(scope, unit?.path ?? null)) return { ok: false, error: "Choose a unit within your reach.", fieldErrors: { unitId: ["Outside your unit"] } };

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86_400_000);
  const invite = await prisma.$transaction(async (tx) => {
    const created = await tx.memberInvite.create({
      data: { organisationId: access.organisation.id, planId: plan.id, token, email: parsed.data.email, unitId: parsed.data.unitId, maxUses: parsed.data.email ? 1 : parsed.data.maxUses, createdById: access.userId, expiresAt },
    });
    if (parsed.data.email) await enqueueOutbox(tx, "member-invite", { inviteId: created.id, organisationId: access.organisation.id });
    await recordAuditEvent({ action: "MEMBER_INVITE_CREATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "MemberInvite", targetId: created.id, metadata: { personal: Boolean(parsed.data.email) }, client: tx });
    return created;
  });
  revalidatePath(`/dashboard/${access.organisation.slug}/plans/${plan.id}`);
  return { ok: true, data: { token: invite.token } };
}

export async function revokeMemberInvite(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ organisationSlug: z.string().trim().min(1), inviteId: z.string().trim().min(1).max(64) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await orgActionAccess(parsed.data.organisationSlug, "members.manage");
  if (!access.ok) return access;
  // Staff limited to a unit revoke only the invites that place people inside it.
  const invite = await prisma.memberInvite.findFirst({ where: { id: parsed.data.inviteId, organisationId: access.organisation.id, revokedAt: null }, select: { unitId: true } });
  const unit = invite?.unitId ? await prisma.orgUnit.findFirst({ where: { id: invite.unitId, organisationId: access.organisation.id }, select: { path: true } }) : null;
  if (!invite || !unitInScope(await teamScope(access.organisation.id, access.membership.unitId), unit?.path ?? null)) return { ok: false, error: "Invite not found." };
  const updated = await prisma.memberInvite.updateMany({ where: { id: parsed.data.inviteId, organisationId: access.organisation.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (updated.count !== 1) return { ok: false, error: "Invite not found." };
  await recordAuditEvent({ action: "MEMBER_INVITE_REVOKED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "MemberInvite", targetId: parsed.data.inviteId });
  revalidatePath(`/dashboard/${access.organisation.slug}/plans`, "layout");
  return { ok: true };
}
