"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess, type OrgActionAccess } from "@/lib/permissions";
import { teamScope, unitInScope, type TeamScope } from "@/lib/membership/scope";
import { decideTerm, extendTerm, MembershipError, openTerm, startRenewal, upsertMember } from "@/lib/membership/service";
import { memberProfileSchema, validateFieldValues } from "@/lib/membership/validators";
import { reissueCardsForRoleChange } from "@/lib/cards/issue";
import { addDays, startOfLocalDay } from "@/lib/membership/periods";
import type { Capability } from "@/lib/permissionRoles";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const id = z.string().trim().min(1).max(64);

type Access = Extract<OrgActionAccess, { ok: true }>;

async function access(slug: unknown, capability: Capability): Promise<{ ok: false; error: string } | { ok: true; access: Access; scope: TeamScope; org: { id: string; slug: string; timezone: string; financialYearStartMonth: number } }> {
  const result = await orgActionAccess(slug, capability);
  if (!result.ok) return result;
  if (await isActionRateLimited("action", result.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: result.organisation.id }, select: { id: true, slug: true, timezone: true, financialYearStartMonth: true } });
  return { ok: true, access: result, scope: await teamScope(result.organisation.id, result.membership.unitId), org };
}

async function unitPath(organisationId: string, unitId: string | null) {
  if (!unitId) return null;
  const unit = await prisma.orgUnit.findFirst({ where: { organisationId, id: unitId, archivedAt: null }, select: { path: true } });
  return unit?.path ?? undefined;
}

/** The member, if it exists in this organisation and in the manager's unit scope. */
async function scopedMember(scope: TeamScope, memberId: string) {
  const member = await prisma.member.findFirst({ where: { id: memberId, organisationId: scope.organisationId }, include: { unit: { select: { path: true } } } });
  if (!member || !unitInScope(scope, member.unit?.path ?? null)) return null;
  return member;
}

function refresh(slug: string, memberId?: string) {
  revalidatePath(`/dashboard/${slug}/members`);
  revalidatePath(`/dashboard/${slug}`);
  if (memberId) revalidatePath(`/dashboard/${slug}/members/${memberId}`);
}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof MembershipError) return { ok: false, error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, error: "This person already has an open application or unpaid membership on that plan." };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2004") return { ok: false, error: "That would overlap a membership this person already has." };
  throw error;
}

const addSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  profile: z.unknown(),
  planId: id.optional().nullable(),
});

/**
 * A manager adds someone by hand. With a plan, a membership opens straight away (no approval step);
 * a priced plan waits for payment unless it activates first and charges later.
 */
export async function addMember(input: unknown): Promise<ActionResult<{ memberId: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug, "members.manage");
  if (!ctx.ok) return ctx;
  const profile = memberProfileSchema.safeParse(parsed.data.profile);
  if (!profile.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(profile.error) };
  const path = await unitPath(ctx.org.id, profile.data.unitId);
  if (path === undefined) return { ok: false, error: "That unit no longer exists.", fieldErrors: { unitId: ["Choose another unit"] } };
  if (!unitInScope(ctx.scope, path)) return { ok: false, error: "You can only add members to your own unit.", fieldErrors: { unitId: ["Outside your unit"] } };

  const plan = parsed.data.planId ? await prisma.membershipPlan.findFirst({ where: { id: parsed.data.planId, organisationId: ctx.org.id, archivedAt: null }, include: { fields: true } }) : null;
  if (parsed.data.planId && !plan) return { ok: false, error: "That plan is no longer offered." };
  const answers = plan ? validateFieldValues(plan.fields, profile.data.fieldValues, true) : { values: {}, errors: {} };
  if (Object.keys(answers.errors).length) return { ok: false, error: "Answer the plan's questions.", fieldErrors: answers.errors };

  const limit = await prisma.organisation.findUniqueOrThrow({ where: { id: ctx.org.id }, select: { memberLimit: true, _count: { select: { members: true } } } });
  if (limit.memberLimit && limit._count.members >= limit.memberLimit) return { ok: false, error: "This organisation has reached its member limit. Ask the platform admin to raise it." };

  try {
    const member = await prisma.$transaction(async (tx) => {
      const saved = await upsertMember(tx, ctx.org.id, { ...profile.data, fieldValues: answers.values, source: "MANUAL" });
      if (plan) await openTerm(tx, { org: ctx.org, plan, memberId: saved.id, byManager: true, actorUserId: ctx.access.userId });
      await recordAuditEvent({ action: "MEMBER_ADDED", actorUserId: ctx.access.userId, organisationId: ctx.org.id, targetType: "Member", targetId: saved.id, client: tx });
      return saved;
    });
    refresh(ctx.org.slug, member.id);
    return { ok: true, data: { memberId: member.id } };
  } catch (error) {
    return failure(error);
  }
}

const updateSchema = z.object({ organisationSlug: z.string().trim().min(1), memberId: id, profile: z.unknown(), notes: z.string().max(4000).optional() });

export async function updateMember(input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug, "members.manage");
  if (!ctx.ok) return ctx;
  const member = await scopedMember(ctx.scope, parsed.data.memberId);
  if (!member) return { ok: false, error: "Member not found." };
  if (member.anonymisedAt) return { ok: false, error: "This member's details were erased." };
  const profile = memberProfileSchema.safeParse(parsed.data.profile);
  if (!profile.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(profile.error) };
  const path = await unitPath(ctx.org.id, profile.data.unitId);
  if (path === undefined || !unitInScope(ctx.scope, path)) return { ok: false, error: "Choose a unit within your reach.", fieldErrors: { unitId: ["Outside your unit"] } };
  if (profile.data.email !== member.email) {
    const taken = await prisma.member.count({ where: { organisationId: ctx.org.id, email: profile.data.email, id: { not: member.id } } });
    if (taken) return { ok: false, error: "Another member already uses that email.", fieldErrors: { email: ["Already a member"] } };
  }
  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: {
        name: profile.data.name,
        email: profile.data.email,
        phone: profile.data.phone,
        stateCode: profile.data.stateCode,
        unitId: profile.data.unitId,
        isMinor: profile.data.isMinor,
        guardianName: profile.data.guardianName,
        guardianEmail: profile.data.guardianEmail,
        guardianPhone: profile.data.guardianPhone,
        fieldValues: { ...(member.fieldValues as Record<string, unknown>), ...profile.data.fieldValues } as Prisma.InputJsonValue,
        // A changed email unlinks the account; the new owner links again by signing in.
        ...(profile.data.email !== member.email ? { userId: null } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      },
    });
    await recordAuditEvent({ action: "MEMBER_UPDATED", actorUserId: ctx.access.userId, organisationId: ctx.org.id, targetType: "Member", targetId: member.id, client: tx });
  });
  refresh(ctx.org.slug, member.id);
  return { ok: true };
}

const decisionSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  termIds: z.array(id).min(1).max(200),
  action: z.enum(["approve", "reject", "cancel", "revoke", "reinstate"]),
  reason: z.string().trim().max(1000).optional().transform((value) => value || null),
});

/** Approve, decline, cancel, revoke or reinstate one or many memberships. Each is its own transaction. */
export async function decideMemberships(input: unknown): Promise<ActionResult<{ done: number; skipped: number }>> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  if ((parsed.data.action === "reject" || parsed.data.action === "revoke") && !parsed.data.reason) {
    return { ok: false, error: "Add a note; the member is told why.", fieldErrors: { reason: ["Required"] } };
  }
  const ctx = await access(parsed.data.organisationSlug, "members.manage");
  if (!ctx.ok) return ctx;
  const terms = await prisma.membershipTerm.findMany({
    where: { id: { in: parsed.data.termIds }, organisationId: ctx.org.id },
    select: { id: true, member: { select: { unit: { select: { path: true } } } } },
  });
  let done = 0;
  let skipped = parsed.data.termIds.length - terms.length;
  let lastError: string | null = null;
  for (const term of terms) {
    if (!unitInScope(ctx.scope, term.member.unit?.path ?? null)) {
      skipped += 1;
      continue;
    }
    try {
      await prisma.$transaction((tx) => decideTerm(tx, { org: ctx.org, termId: term.id, action: parsed.data.action, actorUserId: ctx.access.userId, reason: parsed.data.reason }));
      done += 1;
    } catch (error) {
      skipped += 1;
      lastError = failure(error).error;
    }
  }
  refresh(ctx.org.slug);
  if (done === 0) return { ok: false, error: lastError ?? "Nothing could be changed. Reload and try again." };
  return { ok: true, data: { done, skipped } };
}

const renewSchema = z.object({ organisationSlug: z.string().trim().min(1), memberId: id, planId: id });

/** Start a renewal (or a rejoin after a lapse) on a member's behalf. */
export async function renewMember(input: unknown): Promise<ActionResult> {
  const parsed = renewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug, "members.manage");
  if (!ctx.ok) return ctx;
  const member = await scopedMember(ctx.scope, parsed.data.memberId);
  if (!member) return { ok: false, error: "Member not found." };
  const plan = await prisma.membershipPlan.findFirst({ where: { id: parsed.data.planId, organisationId: ctx.org.id } });
  if (!plan) return { ok: false, error: "Plan not found." };
  try {
    await prisma.$transaction((tx) => startRenewal(tx, { org: ctx.org, plan, memberId: member.id, byManager: true, actorUserId: ctx.access.userId }));
  } catch (error) {
    return failure(error);
  }
  refresh(ctx.org.slug, member.id);
  return { ok: true };
}

const extendSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  termId: id,
  lastDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  reason: z.string().trim().min(3, "Say why").max(500),
});

/** Move a membership's last valid day, with a reason recorded on the timeline. */
export async function extendMembership(input: unknown): Promise<ActionResult> {
  const parsed = extendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const ctx = await access(parsed.data.organisationSlug, "members.manage");
  if (!ctx.ok) return ctx;
  const term = await prisma.membershipTerm.findFirst({ where: { id: parsed.data.termId, organisationId: ctx.org.id }, select: { id: true, memberId: true, member: { select: { unit: { select: { path: true } } } } } });
  if (!term || !unitInScope(ctx.scope, term.member.unit?.path ?? null)) return { ok: false, error: "Membership not found." };
  const [year, month, day] = parsed.data.lastDay.split("-").map(Number);
  // The stored end is exclusive: midnight after the last valid day, in the organisation's timezone.
  const exclusiveEnd = startOfLocalDay(addDays({ year, month, day }, 1), ctx.org.timezone);
  try {
    await prisma.$transaction((tx) => extendTerm(tx, { org: ctx.org, termId: term.id, endsAt: exclusiveEnd, actorUserId: ctx.access.userId, reason: parsed.data.reason }));
  } catch (error) {
    return failure(error);
  }
  refresh(ctx.org.slug, term.memberId);
  return { ok: true };
}

const rolesSchema = z.object({ organisationSlug: z.string().trim().min(1), memberId: id, roleIds: z.array(id).max(20), primaryRoleId: id.optional().nullable() });

/** Give a member their organisation roles; the primary one prints on the card, so changing it reissues their cards. */
export async function assignMemberRoles(input: unknown): Promise<ActionResult> {
  const parsed = rolesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug, "members.manage");
  if (!ctx.ok) return ctx;
  const member = await scopedMember(ctx.scope, parsed.data.memberId);
  if (!member) return { ok: false, error: "Member not found." };
  const roleIds = [...new Set(parsed.data.roleIds)];
  const roles = await prisma.memberRole.count({ where: { organisationId: ctx.org.id, id: { in: roleIds }, archivedAt: null } });
  if (roles !== roleIds.length) return { ok: false, error: "One of those roles no longer exists." };
  const primary = parsed.data.primaryRoleId && roleIds.includes(parsed.data.primaryRoleId) ? parsed.data.primaryRoleId : roleIds[0] ?? null;
  await prisma.$transaction(async (tx) => {
    const before = await tx.memberRoleAssignment.findFirst({ where: { memberId: member.id, isPrimary: true }, select: { roleId: true } });
    await tx.memberRoleAssignment.deleteMany({ where: { memberId: member.id } });
    if (roleIds.length) {
      await tx.memberRoleAssignment.createMany({ data: roleIds.map((roleId) => ({ organisationId: ctx.org.id, memberId: member.id, roleId, isPrimary: roleId === primary })) });
    }
    await recordAuditEvent({ action: "MEMBER_ROLES_CHANGED", actorUserId: ctx.access.userId, organisationId: ctx.org.id, targetType: "Member", targetId: member.id, metadata: { roles: roleIds.length }, client: tx });
    if ((before?.roleId ?? null) !== primary) await reissueCardsForRoleChange(tx, ctx.org.id, member.id, ctx.access.userId);
  });
  refresh(ctx.org.slug, member.id);
  return { ok: true };
}
