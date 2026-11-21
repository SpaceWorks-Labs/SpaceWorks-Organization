import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { smartGroupWhereInScope } from "@/lib/groups/conditions";
import { memberWhere, type TeamScope } from "@/lib/membership/scope";
import { ISSUE_LIMIT } from "./core";

/*
 * Who a certificate goes to: chosen members, every current member of a plan, or a smart group. Every choice is
 * narrowed by the issuer's own reach first (`memberWhere`: unit and grouping limits), so nobody can issue to a
 * member they cannot see. Members erased by a privacy request never match.
 */

export type CertificateTarget =
  | { kind: "members"; memberIds: string[] }
  | { kind: "plan"; planId: string }
  | { kind: "group"; groupId: string };

export type ResolvedTargets = { ok: true; memberIds: string[] } | { ok: false; error: string };

/** Plan members are those whose membership on it is running (active or in its grace period). */
const PLAN_STATUSES = ["ACTIVE", "GRACE"] as const;

async function targetWhere(scope: TeamScope, target: CertificateTarget): Promise<Prisma.MemberWhereInput | string> {
  const own: Prisma.MemberWhereInput = { anonymisedAt: null };
  if (target.kind === "members") return { AND: [memberWhere(scope), own, { id: { in: target.memberIds } }] };
  if (target.kind === "plan") {
    const plan = await prisma.membershipPlan.findFirst({ where: { id: target.planId, organisationId: scope.organisationId }, select: { id: true } });
    if (!plan) return "That plan no longer exists.";
    return { AND: [memberWhere(scope), own, { terms: { some: { planId: plan.id, status: { in: [...PLAN_STATUSES] } } } }] };
  }
  const group = await prisma.smartGroup.findFirst({ where: { id: target.groupId, organisationId: scope.organisationId }, select: { id: true } });
  if (!group) return "That group no longer exists.";
  return { AND: [await smartGroupWhereInScope(scope, group.id), own] };
}

/** The member ids to issue to, inside `scope`. More than the per-request limit is refused, never cut short. */
export async function resolveTargets(scope: TeamScope, target: CertificateTarget): Promise<ResolvedTargets> {
  const where = await targetWhere(scope, target);
  if (typeof where === "string") return { ok: false, error: where };
  const found = await prisma.member.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: ISSUE_LIMIT + 1 });
  if (found.length > ISSUE_LIMIT) {
    const total = await prisma.member.count({ where });
    return { ok: false, error: `${total} members match. One request issues up to ${ISSUE_LIMIT}: narrow it to a unit or a smaller group.` };
  }
  if (target.kind === "members" && found.length !== new Set(target.memberIds).size) return { ok: false, error: "Some of these members can't be found." };
  if (found.length === 0) return { ok: false, error: "No members match." };
  return { ok: true, memberIds: found.map((member) => member.id) };
}
