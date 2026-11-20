import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** One grouping a team member is limited to: the subtrees (by path) of the values they may reach. */
export type GroupingLimit = { groupingId: string; valueIds: string[]; paths: string[] };

/**
 * A team member's reach: the whole organisation, or a unit subtree AND every grouping limit. For each limited
 * grouping the member must hold a value inside one of its limited values' subtrees.
 */
export type TeamScope = { organisationId: string; unitId: string | null; unitPath: string | null; limits: GroupingLimit[] };

type ScopeRow = { groupingId: string; valueId: string };
/** A team member, or the platform's stand-in for one. `scopes` is read here when the caller hasn't loaded them. */
export type ScopeSubject = { id: string; unitId: string | null; scopes?: readonly ScopeRow[] };

const MISSING = "__missing__";

export async function teamScope(organisationId: string, who: ScopeSubject | null): Promise<TeamScope> {
  if (!who) return { organisationId, unitId: null, unitPath: null, limits: [] };
  let unitPath: string | null = null;
  if (who.unitId) {
    const unit = await prisma.orgUnit.findFirst({ where: { organisationId, id: who.unitId }, select: { path: true } });
    // A scope pointing at a missing unit sees nothing rather than everything.
    unitPath = unit?.path ?? MISSING;
  }
  const rows = who.scopes ?? (who.id.startsWith("platform:") ? [] : await prisma.teamMemberScope.findMany({ where: { organisationId, teamMemberId: who.id }, select: { groupingId: true, valueId: true } }));
  return { organisationId, unitId: who.unitId, unitPath, limits: await resolveLimits(organisationId, rows) };
}

/** Group scope rows by grouping and look up each value's path. A missing value reaches nothing. */
export async function resolveLimits(organisationId: string, rows: readonly ScopeRow[]): Promise<GroupingLimit[]> {
  if (!rows.length) return [];
  const values = await prisma.orgGroupingValue.findMany({ where: { organisationId, id: { in: rows.map((row) => row.valueId) } }, select: { id: true, groupingId: true, path: true } });
  const byId = new Map(values.map((value) => [value.id, value]));
  const limits = new Map<string, GroupingLimit>();
  for (const row of rows) {
    const limit = limits.get(row.groupingId) ?? { groupingId: row.groupingId, valueIds: [], paths: [] };
    const value = byId.get(row.valueId);
    limit.valueIds.push(row.valueId);
    limit.paths.push(value && value.groupingId === row.groupingId ? value.path : MISSING);
    limits.set(row.groupingId, limit);
  }
  return [...limits.values()];
}

const within = (path: string | null, ancestor: string) => path !== null && (path === ancestor || path.startsWith(`${ancestor}/`));
const subtreeWhere = (paths: readonly string[]) => paths.flatMap((path) => [{ path }, { path: { startsWith: `${path}/` } }]);

/** Whether a scope limits reach at all (a unit or any grouping). */
export function isLimited(scope: Pick<TeamScope, "unitPath" | "limits">): boolean {
  return scope.unitPath !== null || scope.limits.length > 0;
}

/** The grouping part of a member filter: one `some` per limited grouping, all of which must hold. */
export function groupingLimitsWhere(limits: readonly GroupingLimit[]): Prisma.MemberWhereInput[] {
  return limits.map((limit) => ({ groupingValues: { some: { groupingId: limit.groupingId, value: { is: { OR: subtreeWhere(limit.paths) } } } } }));
}

/**
 * Members a scoped manager may see: their unit's subtree and their grouping limits. Org-wide scope sees every
 * member. The limits sit under `AND`, so a caller that spreads this and adds its own `AND` must nest this inside it.
 */
export function memberWhere(scope: Pick<TeamScope, "organisationId" | "unitPath" | "limits"> & { unitId?: string | null }): Prisma.MemberWhereInput {
  const and: Prisma.MemberWhereInput[] = [];
  if (scope.unitPath) and.push({ unit: { is: { OR: subtreeWhere([scope.unitPath]) } } });
  and.push(...groupingLimitsWhere(scope.limits));
  return and.length ? { organisationId: scope.organisationId, AND: and } : { organisationId: scope.organisationId };
}

/** Whether a unit sits inside a scope (a scoped manager may only place members there). */
export function unitInScope(scope: Pick<TeamScope, "unitPath">, unitPath: string | null): boolean {
  if (!scope.unitPath) return true;
  if (!unitPath) return false;
  return within(unitPath, scope.unitPath);
}

/** Whether a grouping value (by path) is one a limited manager may give: any value of an unlimited grouping. */
export function valueInScope(scope: Pick<TeamScope, "limits">, groupingId: string, valuePath: string): boolean {
  const limit = scope.limits.find((entry) => entry.groupingId === groupingId);
  return !limit || limit.paths.some((path) => within(valuePath, path));
}

/** Whether the values a member holds (`groupingId` and value path) satisfy every grouping limit. */
export function heldValuesInScope(scope: Pick<TeamScope, "limits">, held: ReadonlyArray<{ groupingId: string; path: string }>): boolean {
  return scope.limits.every((limit) => held.some((value) => value.groupingId === limit.groupingId && limit.paths.some((path) => within(value.path, path))));
}

/** Whether the member exists in this scope (database check: the one place unit and grouping limits are judged together). */
export async function memberInScope(scope: TeamScope, memberId: string): Promise<boolean> {
  return (await prisma.member.count({ where: { AND: [memberWhere(scope), { id: memberId }] } })) > 0;
}

/** A short fingerprint of the grouping limits, for cache keys: equal limits share a key, different ones never do. */
export function limitsKey(limits: readonly GroupingLimit[]): string {
  if (!limits.length) return "all";
  const text = limits.map((limit) => `${limit.groupingId}:${[...limit.valueIds].sort().join(",")}`).sort().join("|");
  return `g-${createHash("sha1").update(text).digest("hex").slice(0, 16)}`;
}
