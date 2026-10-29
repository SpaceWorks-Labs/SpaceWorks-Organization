"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { enqueueOutbox } from "@/lib/outbox";
import { queueChatAlerts } from "@/lib/chat/notify";
import { canTransition, PENDING_STATUSES, statusAt } from "@/lib/membership/lifecycle";
import { decideTerm, MembershipError, startRenewal } from "@/lib/membership/service";
import { memberProfileSchema, validateFieldValues } from "@/lib/membership/validators";
import { findOwnMember, type OwnMember } from "@/lib/portal/member";
import { walletState } from "@/lib/portal/walletStatus";
import { requestErasure, withdrawErasure } from "@/lib/portal/erasure";
import { PaymentError, ORG_FOR_PAYMENTS } from "@/lib/payments/charges";
import { requestRefund, withdrawRefundRequest } from "@/lib/payments/refundRequests";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const id = z.string().trim().min(1).max(64);
const slug = z.string().trim().min(1).max(64);

type Context = { ok: true; userId: string; member: OwnMember } | { ok: false; error: string };

/** The signed-in person and their own member record in the organisation, or a refusal. */
async function own(organisationSlug: string): Promise<Context> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in to continue." };
  if (await isActionRateLimited("action", userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  const member = await findOwnMember(userId, organisationSlug);
  if (!member) return { ok: false, error: "We couldn't find that membership on your account." };
  return { ok: true, userId, member };
}

function refresh(member: OwnMember) {
  revalidatePath("/account");
  revalidatePath(`/account/memberships/${member.organisation.slug}`);
  revalidatePath("/account/privacy");
  revalidatePath(`/dashboard/${member.organisation.slug}/members/${member.id}`);
}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof MembershipError || error instanceof PaymentError) return { ok: false, error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "You already have an open renewal on this plan." };
  // The no-overlap exclusion constraint has no Prisma error code, so it arrives as an unknown request error.
  if (error instanceof Prisma.PrismaClientUnknownRequestError && error.message.includes("MembershipTerm_no_overlap")) return { ok: false, error: "That would overlap a membership you already have." };
  throw error;
}

const planSchema = z.object({ organisationSlug: slug, planId: id });

/** Renew (or rejoin after a lapse). A priced plan waits for payment; the member is emailed how to pay. */
export async function renewMembership(input: unknown): Promise<ActionResult<{ termId: string; status: string }>> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await own(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { member } = ctx;
  const plan = await prisma.membershipPlan.findFirst({ where: { id: parsed.data.planId, organisationId: member.organisationId } });
  if (!plan) return { ok: false, error: "That plan is no longer offered." };
  const chain = await prisma.membershipTerm.findMany({ where: { organisationId: member.organisationId, memberId: member.id, planId: plan.id } });
  if (chain.length === 0) return { ok: false, error: "You don't hold this membership. Join from the organisation's page." };
  const state = walletState(chain, plan, { now: new Date(), timeZone: member.organisation.timezone, organisationActive: member.organisation.status === "ACTIVE" });
  if (!state.actions.renew && !state.actions.rejoin) {
    return { ok: false, error: state.renewalOpensAt ? "Renewal isn't open yet. We'll email you when it is." : "This membership can't be renewed from your account. Contact the organisation." };
  }
  try {
    const term = await prisma.$transaction((tx) => startRenewal(tx, { org: member.organisation, plan, memberId: member.id, byManager: false, actorUserId: ctx.userId }));
    await recordAuditEvent({ action: "MEMBERSHIP_RENEWED_BY_MEMBER", actorUserId: ctx.userId, organisationId: member.organisationId, targetType: "MembershipTerm", targetId: term.id });
    refresh(member);
    return { ok: true, data: { termId: term.id, status: term.status } };
  } catch (error) {
    return failure(error);
  }
}

const termSchema = z.object({ organisationSlug: slug, termId: id });

/** Call off an application, an unpaid term or a paid-early renewal. Money already paid stays on record. */
export async function withdrawTerm(input: unknown): Promise<ActionResult> {
  const parsed = termSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await own(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { member } = ctx;
  const term = await prisma.membershipTerm.findFirst({ where: { id: parsed.data.termId, organisationId: member.organisationId, memberId: member.id } });
  const status = term ? statusAt(term, new Date()) : null;
  if (!term || !status || !(PENDING_STATUSES.has(status) || status === "UPCOMING")) return { ok: false, error: "There's nothing to cancel on this membership." };
  try {
    await prisma.$transaction((tx) => decideTerm(tx, { org: member.organisation, termId: term.id, action: "withdraw", actorUserId: ctx.userId, reason: "Cancelled by the member" }));
    refresh(member);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Leave: end the membership on a plan now, with anything pending or paid ahead. Nothing is deleted. */
export async function leaveMembership(input: unknown): Promise<ActionResult> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await own(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { member } = ctx;
  const now = new Date();
  const terms = await prisma.membershipTerm.findMany({ where: { organisationId: member.organisationId, memberId: member.id, planId: parsed.data.planId }, orderBy: { createdAt: "asc" } });
  const ending = terms.filter((term) => canTransition("withdraw", statusAt(term, now)));
  if (ending.length === 0) return { ok: false, error: "This membership has already ended." };
  try {
    await prisma.$transaction(async (tx) => {
      for (const term of ending) await decideTerm(tx, { org: member.organisation, termId: term.id, action: "withdraw", actorUserId: ctx.userId, reason: "Left from their account", now });
      await recordAuditEvent({ action: "MEMBER_LEFT", actorUserId: ctx.userId, organisationId: member.organisationId, targetType: "Member", targetId: member.id, client: tx });
      await enqueueOutbox(tx, "membership-notice", { termId: ending.at(-1)!.id, organisationId: member.organisationId, notice: "left" });
      await queueChatAlerts(tx, member.organisationId, "member-left", { termId: ending.at(-1)!.id });
    });
    refresh(member);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

const refundRequestSchema = z.object({ organisationSlug: slug, termId: id, reason: z.string().trim().min(3, "Tell the organisation why").max(500) });

/** Ask to cancel a paid membership and get money back under the organisation's refund policy. */
export async function requestMembershipRefund(input: unknown): Promise<ActionResult> {
  const parsed = refundRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const ctx = await own(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { member } = ctx;
  try {
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: member.organisationId }, select: ORG_FOR_PAYMENTS });
    await prisma.$transaction((tx) => requestRefund(tx, { org, memberId: member.id, termId: parsed.data.termId, reason: parsed.data.reason, userId: ctx.userId }));
    refresh(member);
    revalidatePath(`/dashboard/${member.organisation.slug}/payments`);
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "You've already asked for a refund on this membership." };
    return failure(error);
  }
}

const requestIdSchema = z.object({ organisationSlug: slug, requestId: id });

/** Call off an open refund request; the membership carries on. */
export async function withdrawMembershipRefund(input: unknown): Promise<ActionResult> {
  const parsed = requestIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await own(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { member } = ctx;
  try {
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: member.organisationId }, select: ORG_FOR_PAYMENTS });
    await prisma.$transaction((tx) => withdrawRefundRequest(tx, { org, memberId: member.id, requestId: parsed.data.requestId, userId: ctx.userId }));
    refresh(member);
    revalidatePath(`/dashboard/${member.organisation.slug}/payments`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

const profileSchema = z.object({ organisationSlug: slug, profile: z.record(z.string(), z.unknown()) });

/**
 * Members edit their name, phone, state, guardian details (for minors) and answers to the questions of the
 * plans they hold. Email (the account link), unit and admin-only answers stay with the organisation.
 */
export async function updateMemberProfile(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await own(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { member } = ctx;
  const profile = memberProfileSchema.safeParse({ ...parsed.data.profile, email: member.email, unitId: member.unitId, isMinor: member.isMinor });
  if (!profile.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(profile.error) };
  const planIds = (await prisma.membershipTerm.findMany({ where: { memberId: member.id, organisationId: member.organisationId }, distinct: ["planId"], select: { planId: true } })).map((term) => term.planId);
  const fields = (await prisma.planField.findMany({ where: { organisationId: member.organisationId, planId: { in: planIds }, adminOnly: false }, orderBy: { sortOrder: "asc" } }))
    .filter((field, index, all) => all.findIndex((other) => other.key === field.key) === index);
  const answers = validateFieldValues(fields, profile.data.fieldValues, false);
  if (Object.keys(answers.errors).length) return { ok: false, error: "Answer the questions marked as required.", fieldErrors: answers.errors };

  const values = { ...(member.fieldValues as Record<string, unknown>) };
  for (const field of fields) delete values[field.key];
  const guardian = member.isMinor ? { guardianName: profile.data.guardianName, guardianEmail: profile.data.guardianEmail, guardianPhone: profile.data.guardianPhone } : {};
  await prisma.member.update({
    where: { id: member.id },
    data: { name: profile.data.name, phone: profile.data.phone, stateCode: profile.data.stateCode, ...guardian, fieldValues: { ...values, ...answers.values } as Prisma.InputJsonValue },
  });
  await recordAuditEvent({ action: "MEMBER_PROFILE_UPDATED_BY_MEMBER", actorUserId: ctx.userId, organisationId: member.organisationId, targetType: "Member", targetId: member.id });
  refresh(member);
  return { ok: true };
}

const consentSchema = z.object({ organisationSlug: slug, consentId: id });

/** Withdraw a consent. The record stays, with the date it was withdrawn. */
export async function withdrawConsent(input: unknown): Promise<ActionResult> {
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await own(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const { member } = ctx;
  const updated = await prisma.consentRecord.updateMany({ where: { id: parsed.data.consentId, organisationId: member.organisationId, memberId: member.id, withdrawnAt: null }, data: { withdrawnAt: new Date() } });
  if (updated.count !== 1) return { ok: false, error: "This consent was already withdrawn." };
  await recordAuditEvent({ action: "CONSENT_WITHDRAWN", actorUserId: ctx.userId, organisationId: member.organisationId, targetType: "ConsentRecord", targetId: parsed.data.consentId });
  refresh(member);
  return { ok: true };
}

const erasureSchema = z.object({ organisationSlug: slug, reason: z.string().trim().max(1000).optional().default("") });

/** Ask the organisation to erase your details. A manager approves or declines it. */
export async function requestDataErasure(input: unknown): Promise<ActionResult> {
  const parsed = erasureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Keep the reason under 1,000 characters.", fieldErrors: flattenZodErrors(parsed.error) };
  const ctx = await own(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  try {
    await prisma.$transaction((tx) => requestErasure(tx, { organisationId: ctx.member.organisationId, memberId: ctx.member.id, userId: ctx.userId, reason: parsed.data.reason }));
    refresh(ctx.member);
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "You already asked. The organisation will email you their decision." };
    return failure(error);
  }
}

const withdrawErasureSchema = z.object({ organisationSlug: slug, requestId: id });

export async function withdrawDataErasure(input: unknown): Promise<ActionResult> {
  const parsed = withdrawErasureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await own(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  try {
    await prisma.$transaction((tx) => withdrawErasure(tx, { organisationId: ctx.member.organisationId, memberId: ctx.member.id, requestId: parsed.data.requestId, userId: ctx.userId }));
    refresh(ctx.member);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
