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
import { lockMemberByEmail } from "@/lib/membership/memberLock";
import { MEMBERSHIP_NOTICE_VERSION, memberProfileSchema } from "@/lib/membership/validators";
import { DEFAULT_JOIN_FIELDS, joinFieldsSchema } from "@/lib/membership/joinFields";
import { attachJoinPhoto, joinProfile, joinSettingErrors, readJoinInput, type JoinPhotoMode } from "@/lib/membership/joinSubmission";
import { replacePlanAnswers, validatePlanAnswers } from "@/lib/membership/planAnswers";
import { prepareMemberPhoto, type PreparedMemberPhoto } from "@/lib/membership/photo";
import { teamScope, unitInScope } from "@/lib/membership/scope";
import { pathWithin, planOffersUnit } from "@/lib/membership/planUnits";
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
  guardianConsent: z.boolean().optional().default(false),
  profile: z.unknown(),
});

/** Is an invite usable now, by this email? */
function inviteUsable(invite: { usedOut: boolean; revokedAt: Date | null; expiresAt: Date | null; email: string | null }, email: string) {
  if (invite.usedOut || invite.revokedAt || (invite.expiresAt && invite.expiresAt <= new Date())) return false;
  return !invite.email || invite.email === email;
}

type JoinOutcome = { status: string; termId: string; payment: PaymentGuidance | null; payUrl: string | null; accountUrl: string; warning: string | null };

/**
 * Join an organisation on a plan. The account's verified email becomes the member's email, so one person
 * holds one member record per organisation and can see all of them from their account. Takes FormData (the
 * JSON `payload` and an optional `photo`) or the payload itself.
 */
export async function submitJoin(input: FormData | unknown): Promise<ActionResult<JoinOutcome>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in to join." };
  const { payload, photo } = readJoinInput(input);
  const parsed = joinSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  if (!user?.email || !user.emailVerified) return { ok: false, error: "Verify your email address before joining." };
  const email = user.email.toLowerCase();

  const org = await prisma.organisation.findUnique({ where: { slug: parsed.data.organisationSlug }, select: { id: true, slug: true, name: true, status: true, timezone: true, financialYearStartMonth: true, memberLimit: true, unitLevels: true, memberPortal: true, memberPhotoUpload: true } });
  if (!org || org.status !== "ACTIVE") return { ok: false, error: "This organisation isn't taking members right now." };
  const plan = await prisma.membershipPlan.findFirst({ where: { organisationId: org.id, slug: parsed.data.planSlug, archivedAt: null }, include: { fields: { orderBy: { sortOrder: "asc" } }, units: { select: { unit: { select: { path: true } } } } } });
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
  const existing = await prisma.member.findUnique({ where: { organisationId_email: { organisationId: org.id, email } }, select: { unitId: true, isMinor: true, photoUrl: true } });
  const joinFields = joinFieldsSchema.safeParse(plan.joinFields).data ?? DEFAULT_JOIN_FIELDS;
  const photoMode = plan.joinPhoto as JoinPhotoMode;
  const raw = parsed.data.profile && typeof parsed.data.profile === "object" ? (parsed.data.profile as Record<string, unknown>) : {};
  const { minor, profile: submitted } = joinProfile(raw, joinFields, existing);
  const profile = memberProfileSchema.safeParse({ ...submitted, email, unitId: existing?.unitId ?? invite?.unitId ?? raw.unitId });
  if (!profile.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(profile.error) };
  const settingErrors = joinSettingErrors({ fields: joinFields, profile: profile.data, minor, guardianConsent: parsed.data.guardianConsent, photoMode, photo, hasPhoto: Boolean(existing?.photoUrl) });
  if (Object.keys(settingErrors).length) return { ok: false, error: "Check the highlighted fields.", fieldErrors: settingErrors };
  // Keys admin-only or shaped differently on any plan of the organisation (archived ones too) never come from here.
  const organisationPlans = await prisma.membershipPlan.findMany({ where: { organisationId: org.id }, select: { fields: true } });
  const answers = validatePlanAnswers(plan.fields, profile.data.fieldValues, false, { organisationPlans });
  if (Object.keys(answers.errors).length) return { ok: false, error: "Answer the questions marked as required.", fieldErrors: answers.errors };

  const unitId = profile.data.unitId;
  if (org.unitLevels.length > 0 && !unitId) return { ok: false, error: "Choose your unit.", fieldErrors: { unitId: ["Choose your unit"] } };
  let unitPath: string | null = null;
  if (unitId) {
    const unit = await prisma.orgUnit.findFirst({ where: { organisationId: org.id, id: unitId, ...(existing?.unitId ? {} : { archivedAt: null }) }, select: { path: true } });
    if (!unit) return { ok: false, error: "Choose your unit.", fieldErrors: { unitId: ["Choose another unit"] } };
    if (!planOffersUnit(plan, plan.units.map((entry) => entry.unit.path), unit.path)) return { ok: false, error: "This plan isn't offered in your unit.", fieldErrors: { unitId: ["Not offered here"] } };
    unitPath = unit.path;
  }
  // An invite for a unit stands in for approval only inside it: an existing member elsewhere keeps their unit, so
  // staff limited to one unit can't approve someone outside their reach with it.
  if (invite?.unitId && inviteOk) {
    const inviteUnit = await prisma.orgUnit.findFirst({ where: { organisationId: org.id, id: invite.unitId }, select: { path: true } });
    if (!inviteUnit || !unitPath || !pathWithin(unitPath, inviteUnit.path)) return { ok: false, error: "This invite is for another unit. Ask the organisation for one that matches yours." };
  }
  if (await isActionRateLimited("join", userId)) return { ok: false, error: "Too many attempts. Try again later." };
  // A member who already has a photo keeps it, so their upload isn't used. A bad image stops the join here.
  let prepared: PreparedMemberPhoto | null = null;
  if (photo && !existing?.photoUrl) {
    const checked = await prepareMemberPhoto(photo);
    if ("error" in checked) return { ok: false, error: checked.error, fieldErrors: { photo: [checked.error] } };
    prepared = checked;
  }

  try {
    const term = await prisma.$transaction(async (tx) => {
      if (org.memberLimit && (await tx.member.count({ where: { organisationId: org.id } })) >= org.memberLimit) {
        const existing = await tx.member.count({ where: { organisationId: org.id, email } });
        if (!existing) throw new MembershipError("This organisation is full for now. Contact them directly.");
      }
      // This plan's public answers replace its keys under the member lock; every other key stays.
      const locked = await lockMemberByEmail(tx, org.id, email);
      if (Boolean(locked) !== Boolean(existing) || (locked && locked.isMinor !== existing?.isMinor)) throw new MembershipError("Your details changed while you were joining. Try again.");
      const fieldValues = replacePlanAnswers((locked?.fieldValues ?? {}) as Record<string, unknown>, plan.fields, profile.data.fieldValues, false, { organisationPlans });
      const member = await upsertMember(tx, org.id, {
        ...profile.data,
        phone: joinFields.phone === "HIDDEN" ? undefined : profile.data.phone,
        stateCode: joinFields.state === "HIDDEN" ? undefined : profile.data.stateCode,
        ...(minor ? {} : { guardianName: undefined, guardianEmail: undefined, guardianPhone: undefined }),
        unitId,
        keepExistingUnit: true,
        userId,
        fieldValues,
        fieldValuesMode: "replace",
        source: "JOIN_FORM",
      });
      await tx.consentRecord.create({ data: { organisationId: org.id, memberId: member.id, purpose: "membership", noticeVersion: MEMBERSHIP_NOTICE_VERSION, byGuardian: minor } });
      // An invite stands in for approval: the organisation already chose this person.
      const opened = await openTerm(tx, { org, plan, memberId: member.id, byManager: inviteOk, actorUserId: userId });
      if (invite && inviteOk) {
        const claimed = await tx.memberInvite.updateMany({ where: { id: invite.id, uses: { lt: invite.maxUses } }, data: { uses: { increment: 1 } } });
        if (claimed.count !== 1) throw new MembershipError("This invite was just used up.");
      }
      return opened;
    });
    const warning = prepared ? await attachJoinPhoto({ org, memberId: term.memberId, userId, prepared }) : null;
    revalidatePath(`/dashboard/${org.slug}/members`);
    // How to pay offline, from the member's unit up to the organisation, for the confirmation.
    const unitPath = term.status === "PENDING_PAYMENT" ? (await prisma.member.findUnique({ where: { id: term.memberId }, select: { unit: { select: { path: true } } } }))?.unit?.path : null;
    const payment = term.status === "PENDING_PAYMENT" ? await loadPaymentGuidance(org.id, unitPath, term.currency) : null;
    // Without member accounts there is no account to pay from: a signed pay link instead (lib/payments/payLink.ts).
    const payUrl = term.status !== "PENDING_PAYMENT" ? null : org.memberPortal ? `/account/pay/${term.id}` : `/pay/${payLinkToken(term.id)}`;
    return { ok: true, data: { status: term.status, termId: term.id, payment, payUrl, accountUrl: org.memberPortal ? "/account" : `/o/${org.slug}`, warning } };
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
