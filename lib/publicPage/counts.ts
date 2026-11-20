import "server-only";

import { prisma } from "@/lib/db";
import { publicTotal, suppressSmallCounts, type CountRow, type PublicCounts } from "./live";

/**
 * The live counts section's numbers: aggregates only. A current member has an ACTIVE or GRACE term and has not been
 * erased. Rows are grouped by plan (live plans only) and by top-level unit (a member counts toward the unit at the top
 * of their unit's path). No name, id or contact detail leaves this function, and every count below
 * MIN_PUBLIC_COUNT is removed (lib/publicPage/live.ts). Callers cache it under the organisation's public-page key.
 */

type Wanted = { total: boolean; byPlan: boolean; byUnit: boolean };

const CURRENT = ["ACTIVE", "GRACE"] as const;

export async function loadPublicCounts(organisationId: string, wanted: Wanted): Promise<PublicCounts | null> {
  if (!wanted.total && !wanted.byPlan && !wanted.byUnit) return null;
  const [total, byPlan, byUnit] = await Promise.all([
    wanted.total ? countCurrentMembers(organisationId) : Promise.resolve(0),
    wanted.byPlan ? countByPlan(organisationId) : Promise.resolve([]),
    wanted.byUnit ? countByTopUnit(organisationId) : Promise.resolve([]),
  ]);
  return { total: wanted.total ? publicTotal(total) : null, byPlan: suppressSmallCounts(byPlan), byUnit: suppressSmallCounts(byUnit) };
}

function countCurrentMembers(organisationId: string) {
  return prisma.member.count({ where: { organisationId, anonymisedAt: null, terms: { some: { organisationId, status: { in: [...CURRENT] } } } } });
}

async function countByPlan(organisationId: string): Promise<CountRow[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string; count: number }>>`
    SELECT p."name" AS label, count(DISTINCT t."memberId")::int AS count
    FROM "MembershipTerm" t
    JOIN "MembershipPlan" p ON p."id" = t."planId" AND p."organisationId" = t."organisationId"
    JOIN "Member" m ON m."id" = t."memberId" AND m."organisationId" = t."organisationId"
    WHERE t."organisationId" = ${organisationId} AND t."status"::text IN ('ACTIVE', 'GRACE')
      AND p."archivedAt" IS NULL AND m."anonymisedAt" IS NULL
    GROUP BY p."id", p."name"`;
  return rows.map((row) => ({ label: row.label, count: Number(row.count) }));
}

async function countByTopUnit(organisationId: string): Promise<CountRow[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string; count: number }>>`
    SELECT top."name" AS label, count(DISTINCT m."id")::int AS count
    FROM "Member" m
    JOIN "OrgUnit" u ON u."id" = m."unitId" AND u."organisationId" = m."organisationId"
    JOIN "OrgUnit" top ON top."id" = split_part(u."path", '/', 1) AND top."organisationId" = m."organisationId"
    WHERE m."organisationId" = ${organisationId} AND m."anonymisedAt" IS NULL AND top."archivedAt" IS NULL
      AND EXISTS (SELECT 1 FROM "MembershipTerm" t WHERE t."memberId" = m."id" AND t."organisationId" = m."organisationId" AND t."status"::text IN ('ACTIVE', 'GRACE'))
    GROUP BY top."id", top."name"`;
  return rows.map((row) => ({ label: row.label, count: Number(row.count) }));
}
