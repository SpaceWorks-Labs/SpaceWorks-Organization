"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isCurrencyCode } from "@/lib/money/currencies";
import { memberRoleSchema } from "@/lib/membership/validators";
import { refreshStructure, structureAccess } from "@/lib/structure/access";
import type { ActionResult } from "./org";
import { flattenZodErrors } from "./utils";

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createMemberRole(input: unknown): Promise<ActionResult<{ roleId: string }>> {
  const parsed = memberRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await structureAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  if (parsed.data.unitId && !(await prisma.orgUnit.count({ where: { id: parsed.data.unitId, organisationId: access.organisation.id } }))) return { ok: false, error: "That unit no longer exists." };
  try {
    const count = await prisma.memberRole.count({ where: { organisationId: access.organisation.id } });
    const role = await prisma.memberRole.create({
      data: { organisationId: access.organisation.id, name: parsed.data.name, description: parsed.data.description, color: parsed.data.color, unitId: parsed.data.unitId ?? null, sortOrder: count },
    });
    await recordAuditEvent({ action: "MEMBER_ROLE_CREATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "MemberRole", targetId: role.id });
    await refreshStructure(access.organisation);
    return { ok: true, data: { roleId: role.id } };
  } catch (error) {
    if (isUnique(error)) return { ok: false, error: "A role with that name exists.", fieldErrors: { name: ["Already exists"] } };
    throw error;
  }
}

const updateRoleSchema = memberRoleSchema.extend({ roleId: z.string().trim().min(1).max(64), archived: z.boolean().default(false) });

export async function updateMemberRole(input: unknown): Promise<ActionResult> {
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await structureAccess(parsed.data.organisationSlug);
  if (!access.ok) return access;
  try {
    const updated = await prisma.memberRole.updateMany({
      where: { id: parsed.data.roleId, organisationId: access.organisation.id },
      data: { name: parsed.data.name, description: parsed.data.description, color: parsed.data.color, unitId: parsed.data.unitId ?? null, archivedAt: parsed.data.archived ? new Date() : null },
    });
    if (updated.count !== 1) return { ok: false, error: "Role not found." };
  } catch (error) {
    if (isUnique(error)) return { ok: false, error: "A role with that name exists.", fieldErrors: { name: ["Already exists"] } };
    throw error;
  }
  await refreshStructure(access.organisation);
  return { ok: true };
}

const TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

const preferencesSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  currency: z.string().refine(isCurrencyCode, "Choose a currency"),
  locale: z.string().trim().max(20).optional().transform((value) => value || null).refine((value) => {
    if (!value) return true;
    try {
      return Intl.NumberFormat.supportedLocalesOf([value]).length === 1;
    } catch {
      return false;
    }
  }, "Unknown locale"),
  timezone: z.string().refine((value) => TIMEZONES.has(value) || value === "UTC", "Choose a timezone"),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12),
  offlineConfirmationRequired: z.boolean(),
});

/**
 * Money and calendar preferences. The financial year and timezone can change only before the first
 * membership, because terms and receipt numbering already depend on them.
 */
export async function updateOrganisationPreferences(input: unknown): Promise<ActionResult> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const access = await structureAccess(parsed.data.organisationSlug, "org.settings");
  if (!access.ok) return access;
  const current = await prisma.organisation.findUniqueOrThrow({ where: { id: access.organisation.id }, select: { timezone: true, financialYearStartMonth: true, _count: { select: { terms: true } } } });
  const calendarChanged = current.timezone !== parsed.data.timezone || current.financialYearStartMonth !== parsed.data.financialYearStartMonth;
  if (calendarChanged && current._count.terms > 0) {
    return { ok: false, error: "The financial year and timezone are fixed once memberships exist." };
  }
  await prisma.organisation.update({
    where: { id: access.organisation.id },
    data: {
      currency: parsed.data.currency,
      locale: parsed.data.locale,
      timezone: parsed.data.timezone,
      financialYearStartMonth: parsed.data.financialYearStartMonth,
      offlineConfirmationRequired: parsed.data.offlineConfirmationRequired,
    },
  });
  await recordAuditEvent({ action: "ORGANISATION_PREFERENCES_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "Organisation", targetId: access.organisation.id });
  await refreshStructure(access.organisation);
  return { ok: true };
}
