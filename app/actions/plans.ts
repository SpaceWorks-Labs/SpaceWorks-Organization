"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { invalidateOrg } from "@/lib/cache";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { orgActionAccess } from "@/lib/permissions";
import { planFieldsSchema, planSchema } from "@/lib/membership/validators";
import { z } from "zod";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

const revalidatePath = trackedRevalidation(nextRevalidatePath);


function planData(input: z.infer<typeof planSchema>) {
  return {
    name: input.name,
    slug: input.slug,
    description: input.description,
    currency: input.currency,
    durationType: input.durationType,
    durationMonths: input.durationMonths,
    fixedEndDate: input.fixedEndDate,
    priceNewMinor: input.priceNewMinor,
    priceRenewalMinor: input.priceRenewalMinor,
    joiningFeeMinor: input.joiningFeeMinor,
    rejoinFeeRule: input.rejoinFeeRule,
    rejoinAfterDays: input.rejoinAfterDays,
    graceDays: input.graceDays,
    renewalWindowDays: input.renewalWindowDays,
    reminderDaysBefore: input.reminderDaysBefore,
    reminderDaysAfter: input.reminderDaysAfter,
    lateRenewalBackdate: input.lateRenewalBackdate,
    joinMode: input.joinMode,
    paymentTiming: input.paymentTiming,
    allUnits: input.allUnits,
  };
}

async function unitsBelong(organisationId: string, unitIds: string[]) {
  if (unitIds.length === 0) return true;
  const found = await prisma.orgUnit.count({ where: { organisationId, id: { in: unitIds }, archivedAt: null } });
  return found === new Set(unitIds).size;
}

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createPlan(input: unknown): Promise<ActionResult<{ planId: string }>> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await orgActionAccess(parsed.data.organisationSlug, "plans.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  if (!(await unitsBelong(access.organisation.id, parsed.data.unitIds))) return { ok: false, error: "One of the chosen units no longer exists." };
  try {
    const plan = await prisma.$transaction(async (tx) => {
      const count = await tx.membershipPlan.count({ where: { organisationId: access.organisation.id } });
      const created = await tx.membershipPlan.create({ data: { organisationId: access.organisation.id, sortOrder: count, ...planData(parsed.data) } });
      if (!parsed.data.allUnits) {
        await tx.planUnit.createMany({ data: parsed.data.unitIds.map((unitId) => ({ organisationId: access.organisation.id, planId: created.id, unitId })) });
      }
      await recordAuditEvent({ action: "PLAN_CREATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "MembershipPlan", targetId: created.id, client: tx });
      return created;
    });
    await invalidateOrg(access.organisation.id, "public-page");
    revalidatePath(`/dashboard/${access.organisation.slug}/plans`);
    revalidatePath(`/o/${access.organisation.slug}`);
    return { ok: true, data: { planId: plan.id } };
  } catch (error) {
    if (isUnique(error)) return { ok: false, error: "Another plan already uses that address.", fieldErrors: { slug: ["Already used by another plan"] } };
    throw error;
  }
}

/**
 * Change a plan. Prices and rules apply to new terms only: a term freezes its price and dates when it is
 * created, so members already on the plan keep what they signed up for.
 */
export async function updatePlan(input: unknown): Promise<ActionResult> {
  const withId = z.object({ planId: z.string().trim().min(1).max(64) }).safeParse(input);
  const parsed = planSchema.safeParse(input);
  if (!withId.success || !parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: parsed.success ? {} : flattenZodErrors(parsed.error) };
  const access = await orgActionAccess(parsed.data.organisationSlug, "plans.manage");
  if (!access.ok) return access;
  if (await isActionRateLimited("action", access.userId)) return { ok: false, error: "Too many requests. Try again shortly." };
  if (!(await unitsBelong(access.organisation.id, parsed.data.unitIds))) return { ok: false, error: "One of the chosen units no longer exists." };
  const plan = await prisma.membershipPlan.findFirst({ where: { id: withId.data.planId, organisationId: access.organisation.id }, select: { id: true, currency: true, _count: { select: { terms: true } } } });
  if (!plan) return { ok: false, error: "Plan not found." };
  if (plan._count.terms > 0 && plan.currency !== parsed.data.currency) {
    return { ok: false, error: "This plan already has members, so its currency can't change. Create a new plan in the other currency.", fieldErrors: { currency: ["Fixed once members join"] } };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.membershipPlan.update({ where: { id: plan.id }, data: planData(parsed.data) });
      await tx.planUnit.deleteMany({ where: { planId: plan.id } });
      if (!parsed.data.allUnits) {
        await tx.planUnit.createMany({ data: parsed.data.unitIds.map((unitId) => ({ organisationId: access.organisation.id, planId: plan.id, unitId })) });
      }
      await recordAuditEvent({ action: "PLAN_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "MembershipPlan", targetId: plan.id, client: tx });
    });
  } catch (error) {
    if (isUnique(error)) return { ok: false, error: "Another plan already uses that address.", fieldErrors: { slug: ["Already used by another plan"] } };
    throw error;
  }
  await invalidateOrg(access.organisation.id, "public-page");
  revalidatePath(`/dashboard/${access.organisation.slug}/plans`);
  revalidatePath(`/dashboard/${access.organisation.slug}/plans/${plan.id}`);
  revalidatePath(`/o/${access.organisation.slug}`);
  return { ok: true };
}

const archiveSchema = z.object({ organisationSlug: z.string().trim().min(1), planId: z.string().trim().min(1).max(64), archived: z.boolean() });

/** Plans are archived, never deleted, so the history of every term on them stays intact. */
export async function setPlanArchived(input: unknown): Promise<ActionResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const access = await orgActionAccess(parsed.data.organisationSlug, "plans.manage");
  if (!access.ok) return access;
  const updated = await prisma.membershipPlan.updateMany({ where: { id: parsed.data.planId, organisationId: access.organisation.id }, data: { archivedAt: parsed.data.archived ? new Date() : null } });
  if (updated.count !== 1) return { ok: false, error: "Plan not found." };
  await recordAuditEvent({ action: parsed.data.archived ? "PLAN_ARCHIVED" : "PLAN_RESTORED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "MembershipPlan", targetId: parsed.data.planId });
  await invalidateOrg(access.organisation.id, "public-page");
  revalidatePath(`/dashboard/${access.organisation.slug}/plans`);
  revalidatePath(`/o/${access.organisation.slug}`);
  return { ok: true };
}

/** Replace a plan's join-form questions. Answers already given stay on members under their keys. */
export async function savePlanFields(input: unknown): Promise<ActionResult> {
  const parsed = planFieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the questions.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await orgActionAccess(parsed.data.organisationSlug, "plans.manage");
  if (!access.ok) return access;
  const plan = await prisma.membershipPlan.findFirst({ where: { id: parsed.data.planId, organisationId: access.organisation.id }, select: { id: true } });
  if (!plan) return { ok: false, error: "Plan not found." };
  await prisma.$transaction(async (tx) => {
    await tx.planField.deleteMany({ where: { planId: plan.id } });
    if (parsed.data.fields.length) {
      await tx.planField.createMany({
        data: parsed.data.fields.map((field, index) => ({ ...field, options: field.type === "SELECT" ? field.options : [], organisationId: access.organisation.id, planId: plan.id, sortOrder: index })),
      });
    }
    await recordAuditEvent({ action: "PLAN_FORM_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "MembershipPlan", targetId: plan.id, metadata: { questions: parsed.data.fields.length }, client: tx });
  });
  revalidatePath(`/dashboard/${access.organisation.slug}/plans/${plan.id}`);
  return { ok: true };
}
