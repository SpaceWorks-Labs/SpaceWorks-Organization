import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { groupingLimitsWhere, isLimited, unitInScope, type GroupingLimit, type TeamScope } from "@/lib/membership/scope";
import { prepareDataset, type Dataset, type ReportRows } from "./dataset";

/**
 * What a report covers: one organisation, the unit subtree the viewer may see (narrowed further by the
 * unit filter when it sits inside that subtree), and optionally one plan.
 */
export type ReportScope = {
  organisationId: string;
  /** The unit subtree in force, or null for the whole organisation. */
  unitPath: string | null;
  unitId: string | null;
  planId: string | null;
  /** The viewer's grouping limits: every one must hold for a member to count. */
  limits: GroupingLimit[];
  /** The viewer is limited to a unit or groupings by their team role. */
  scoped: boolean;
  /** One member only (member-level reports C1–C3). */
  memberId?: string;
};

/**
 * Combine the viewer's team scope with the report's unit and plan filters. A unit outside the viewer's
 * own subtree, or from another organisation, is ignored rather than widening anything.
 */
export async function reportScope(team: TeamScope, filters: { unit?: string | null; plan?: string | null }): Promise<ReportScope> {
  let unitPath = team.unitPath;
  let unitId = team.unitId;
  if (filters.unit) {
    const unit = await prisma.orgUnit.findFirst({ where: { organisationId: team.organisationId, id: filters.unit }, select: { id: true, path: true } });
    if (unit && unitInScope(team, unit.path)) {
      unitPath = unit.path;
      unitId = unit.id;
    }
  }
  let planId: string | null = null;
  if (filters.plan) {
    const plan = await prisma.membershipPlan.findFirst({ where: { organisationId: team.organisationId, id: filters.plan }, select: { id: true } });
    planId = plan?.id ?? null;
  }
  return { organisationId: team.organisationId, unitPath, unitId, planId, limits: team.limits, scoped: isLimited(team) };
}

/** Members inside the scope's subtree. Without a unit, the whole organisation (members without a unit too). */
export function scopedMemberWhere(scope: Pick<ReportScope, "organisationId" | "unitPath" | "limits" | "memberId">): Prisma.MemberWhereInput {
  const one = scope.memberId ? { id: scope.memberId } : {};
  const and: Prisma.MemberWhereInput[] = [...(scope.unitPath ? [{ unit: { is: { OR: [{ path: scope.unitPath }, { path: { startsWith: `${scope.unitPath}/` } }] } } }] : []), ...groupingLimitsWhere(scope.limits)];
  return { organisationId: scope.organisationId, ...one, ...(and.length ? { AND: and } : {}) };
}

export function scopedTermWhere(scope: ReportScope): Prisma.MembershipTermWhereInput {
  return { organisationId: scope.organisationId, member: { is: scopedMemberWhere(scope) }, ...(scope.planId ? { planId: scope.planId } : {}) };
}

/** Load the rows behind every membership metric for one scope. */
export async function loadReportRows(scope: ReportScope): Promise<ReportRows> {
  const termWhere = scopedTermWhere(scope);
  const [members, terms, events] = await Promise.all([
    prisma.member.findMany({
      where: scopedMemberWhere(scope),
      select: {
        id: true, memberNumber: true, name: true, unitId: true, source: true, stateCode: true, phone: true, photoUrl: true, isMinor: true, guardianName: true, guardianEmail: true, createdAt: true,
        unit: { select: { path: true } },
        roles: { select: { roleId: true, isPrimary: true }, orderBy: { isPrimary: "desc" } },
      },
    }),
    prisma.membershipTerm.findMany({
      where: termWhere,
      select: { id: true, memberId: true, planId: true, status: true, kind: true, startsAt: true, endsAt: true, graceUntil: true, renewedFromId: true, createdAt: true },
    }),
    prisma.termStatusEvent.findMany({
      where: { organisationId: scope.organisationId, term: { is: termWhere } },
      select: { termId: true, from: true, to: true, effectiveAt: true, cause: true },
    }),
  ]);
  return {
    members: members.map((member) => ({
      id: member.id,
      memberNumber: member.memberNumber,
      name: member.name,
      unitId: member.unitId,
      unitPath: member.unit?.path ?? null,
      source: member.source,
      stateCode: member.stateCode,
      hasPhone: Boolean(member.phone),
      hasPhoto: Boolean(member.photoUrl),
      isMinor: member.isMinor,
      hasGuardian: Boolean(member.guardianName && member.guardianEmail),
      roleIds: member.roles.map((role) => role.roleId),
      createdAt: member.createdAt,
    })),
    terms,
    events,
  };
}

export async function loadDataset(scope: ReportScope): Promise<Dataset> {
  return prepareDataset(await loadReportRows(scope));
}
