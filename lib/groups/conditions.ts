import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { memberWhere, type TeamScope } from "@/lib/membership/scope";
import { compileCondition } from "./compile";
import { smartGroupConditionSchema, type Condition } from "./schema";

export { smartGroupConditionSchema, EVERYONE, TERM_STATUSES, type Condition, type Rule } from "./schema";

const NO_ONE = (organisationId: string): Prisma.MemberWhereInput => ({ organisationId, id: { in: [] } });

/** The condition of a saved smart group of this organisation, or null when it is missing or no longer valid. */
async function loadCondition(organisationId: string, smartGroupId: string) {
  const group = await prisma.smartGroup.findFirst({ where: { id: smartGroupId, organisationId }, select: { condition: true } });
  const parsed = group ? smartGroupConditionSchema.safeParse(group.condition) : null;
  return parsed?.success ? parsed.data : null;
}

/** A condition as a member filter, restricted to the organisation (members anonymised by erasure never match). */
export async function conditionWhere(organisationId: string, condition: Condition): Promise<Prisma.MemberWhereInput> {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { timezone: true } });
  if (!org) return NO_ONE(organisationId);
  const compiled = await compileCondition({ organisationId, timezone: org.timezone, now: new Date() }, condition);
  return { AND: [{ organisationId, anonymisedAt: null }, compiled] };
}

/**
 * The members a smart group covers, as a Prisma filter limited to the organisation. A group that is missing, from
 * another organisation or no longer valid covers nobody. Callers combine it with the viewer's reach
 * (`memberWhere`, or `smartGroupWhereInScope`); it never widens it.
 */
export async function smartGroupWhere(organisationId: string, smartGroupId: string): Promise<Prisma.MemberWhereInput> {
  const condition = await loadCondition(organisationId, smartGroupId);
  return condition ? conditionWhere(organisationId, condition) : NO_ONE(organisationId);
}

/** Whether one member is in a smart group (computed now, never stored). */
export async function memberInSmartGroup(organisationId: string, smartGroupId: string, memberId: string): Promise<boolean> {
  const where = await smartGroupWhere(organisationId, smartGroupId);
  return (await prisma.member.count({ where: { AND: [where, { id: memberId }] } })) > 0;
}

/** A smart group inside a staff member's reach: the members of the group that the scope also lets them see. */
export async function smartGroupWhereInScope(scope: TeamScope, smartGroupId: string): Promise<Prisma.MemberWhereInput> {
  return { AND: [memberWhere(scope), await smartGroupWhere(scope.organisationId, smartGroupId)] };
}

/** How many members a condition covers inside a reach (the builder's live preview). Counts only. */
export async function countCondition(scope: TeamScope, condition: Condition): Promise<number> {
  return prisma.member.count({ where: { AND: [memberWhere(scope), await conditionWhere(scope.organisationId, condition)] } });
}
