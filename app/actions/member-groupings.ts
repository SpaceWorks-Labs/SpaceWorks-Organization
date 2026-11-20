"use server";

import { z } from "zod";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { invalidateOrg } from "@/lib/cache";
import { orgActionAccess } from "@/lib/permissions";
import { heldValuesInScope, memberInScope, memberWhere, teamScope, valueInScope, type TeamScope } from "@/lib/membership/scope";
import { lockMember } from "@/lib/membership/memberLock";
import { heldValues, replaceMemberValues } from "@/lib/groupings/memberValues";
import { GroupingError } from "@/lib/groupings/service";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);
const id = z.string().trim().min(1).max(64);

async function access(organisationSlug: unknown) {
  const result = await orgActionAccess(organisationSlug, "members.manage");
  if (!result.ok) return result;
  if (await isActionRateLimited("action", result.userId)) return { ok: false as const, error: "Too many requests. Try again shortly." };
  return { ...result, scope: await teamScope(result.organisation.id, result.membership) };
}

/** Whether every value (by id) is one this scope may give: values of an unlimited grouping, or inside the limit. */
async function valuesWithinReach(scope: TeamScope, groupingId: string, valueIds: readonly string[]) {
  if (!valueIds.length || !scope.limits.some((limit) => limit.groupingId === groupingId)) return true;
  const values = await prisma.orgGroupingValue.findMany({ where: { organisationId: scope.organisationId, groupingId, id: { in: [...valueIds] } }, select: { path: true } });
  return values.length === valueIds.length && values.every((value) => valueInScope(scope, groupingId, value.path));
}

function refresh(slug: string, organisationId: string, memberId?: string) {
  revalidatePath(`/dashboard/${slug}/members`);
  if (memberId) revalidatePath(`/dashboard/${slug}/members/${memberId}`);
  return invalidateOrg(organisationId, "analytics");
}

const setSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  memberId: id,
  /** Only the groupings listed are replaced; an empty list clears that grouping. */
  groupings: z.array(z.object({ groupingId: id, valueIds: z.array(id).max(60) })).min(1).max(30),
});

/** Set the values a member holds in some groupings (member page). Staff limited by a grouping keep the member in reach. */
export async function setMemberGroupings(input: unknown): Promise<ActionResult> {
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const organisationId = ctx.organisation.id;
  if (!(await memberInScope(ctx.scope, parsed.data.memberId))) return { ok: false, error: "Member not found." };
  for (const entry of parsed.data.groupings) {
    if (!(await valuesWithinReach(ctx.scope, entry.groupingId, entry.valueIds))) return { ok: false, error: "Choose values inside your reach." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      const locked = await lockMember(tx, organisationId, parsed.data.memberId);
      if (!locked || locked.anonymisedAt) throw new GroupingError("This member's details were erased.");
      const before = await heldValues(tx, organisationId, locked.id);
      for (const entry of parsed.data.groupings) {
        // A limited manager never removes values held outside their reach: those stay as they are.
        const outside = before.filter((held) => held.groupingId === entry.groupingId && !valueInScope(ctx.scope, entry.groupingId, held.path)).map((held) => held.valueId);
        await replaceMemberValues(tx, organisationId, locked.id, entry.groupingId, [...new Set([...entry.valueIds, ...outside])]);
      }
      if (!heldValuesInScope(ctx.scope, await heldValues(tx, organisationId, locked.id))) throw new GroupingError("That would move this member outside your reach.");
      await recordAuditEvent({ action: "MEMBER_GROUPINGS_CHANGED", actorUserId: ctx.userId, organisationId, targetType: "Member", targetId: locked.id, metadata: { groupings: parsed.data.groupings.length, memberId: locked.id }, client: tx });
    });
  } catch (error) {
    if (error instanceof GroupingError) return { ok: false, error: error.message };
    throw error;
  }
  await refresh(ctx.organisation.slug, organisationId, parsed.data.memberId);
  return { ok: true };
}

const bulkSchema = z.object({
  organisationSlug: z.string().trim().min(1),
  memberIds: z.array(id).min(1).max(200),
  groupingId: id,
  /** The value to give; null clears the grouping. A grouping that takes several adds it to the ones they hold. */
  valueId: id.nullable(),
});

/** Give many members one value of a grouping, or clear it, from the members list. Each member is its own transaction. */
export async function setGroupingForMembers(input: unknown): Promise<ActionResult<{ done: number; skipped: number }>> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await access(parsed.data.organisationSlug);
  if (!ctx.ok) return ctx;
  const organisationId = ctx.organisation.id;
  const { groupingId, valueId } = parsed.data;
  if (!(await valuesWithinReach(ctx.scope, groupingId, valueId ? [valueId] : []))) return { ok: false, error: "Choose a value inside your reach." };
  const grouping = await prisma.orgGrouping.findFirst({ where: { id: groupingId, organisationId, archivedAt: null }, select: { multiple: true } });
  if (!grouping) return { ok: false, error: "Grouping not found." };
  if (valueId && !(await prisma.orgGroupingValue.count({ where: { id: valueId, organisationId, groupingId, archivedAt: null } }))) return { ok: false, error: "That value no longer exists." };
  const members = await prisma.member.findMany({ where: { AND: [memberWhere(ctx.scope), { id: { in: parsed.data.memberIds }, anonymisedAt: null }] }, select: { id: true } });
  let done = 0;
  let skipped = parsed.data.memberIds.length - members.length;
  for (const { id: memberId } of members) {
    try {
      await prisma.$transaction(async (tx) => {
        const locked = await lockMember(tx, organisationId, memberId);
        if (!locked || locked.anonymisedAt) throw new GroupingError("erased");
        const current = (await tx.memberGroupingValue.findMany({ where: { organisationId, memberId, groupingId }, select: { valueId: true } })).map((row) => row.valueId);
        const next = !valueId ? [] : grouping.multiple ? [...new Set([...current, valueId])] : [valueId];
        await replaceMemberValues(tx, organisationId, memberId, groupingId, next);
        if (!heldValuesInScope(ctx.scope, await heldValues(tx, organisationId, memberId))) throw new GroupingError("outside reach");
        await recordAuditEvent({ action: "MEMBER_GROUPINGS_CHANGED", actorUserId: ctx.userId, organisationId, targetType: "Member", targetId: memberId, metadata: { bulk: true, memberId }, client: tx });
      });
      done += 1;
    } catch (error) {
      if (!(error instanceof GroupingError)) throw error;
      skipped += 1;
    }
  }
  await refresh(ctx.organisation.slug, organisationId);
  if (done === 0) return { ok: false, error: "Nothing could be changed. Check the members are inside your reach and try again." };
  return { ok: true, data: { done, skipped } };
}
