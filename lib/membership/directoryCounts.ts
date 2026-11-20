import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MEMBER_FILTERS, type MemberFilter } from "@/lib/membership/describe";

/**
 * The member directory's seven status counts in one query. The conditions mirror `memberWhere` (unit scope and grouping limits), `scopedMemberWhere`
 * and `memberFilterWhere` (lib/membership/scope.ts, lib/reports/source.ts, lib/cards/exportFilter.ts) exactly; the
 * integration test compares both against the Prisma filters.
 */
export type DirectoryCountInput = {
  organisationId: string;
  /** The viewer's unit scope (a path), or null for the whole organisation. */
  scopePath: string | null;
  /** The viewer's grouping limits: for each grouping, the member must hold a value inside one of these subtrees (paths). */
  limits: ReadonlyArray<{ groupingId: string; paths: readonly string[] }>;
  /** A report drill-down's unit subtree (a path), or null. */
  subtreePath: string | null;
  q: string;
  /** Whether the search may match email addresses. */
  matchEmail: boolean;
  planId?: string;
  unitId?: string;
  roleId?: string;
  /** Members behind a report tile, or null. */
  drillMemberIds: string[] | null;
  now: Date;
};

const DAY_MS = 86_400_000;

const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
const asUtc = (date: Date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

function inSubtree(path: string) {
  return Prisma.sql`EXISTS (SELECT 1 FROM "OrgUnit" u WHERE u."id" = m."unitId" AND u."organisationId" = m."organisationId" AND (u."path" = ${path} OR starts_with(u."path", ${`${path}/`})))`;
}

function baseConditions(input: DirectoryCountInput) {
  const conditions: Prisma.Sql[] = [Prisma.sql`m."organisationId" = ${input.organisationId}`, Prisma.sql`m."anonymisedAt" IS NULL`];
  if (input.scopePath) conditions.push(inSubtree(input.scopePath));
  for (const limit of input.limits) {
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "MemberGroupingValue" g JOIN "OrgGroupingValue" v ON v."id" = g."valueId" AND v."organisationId" = g."organisationId"
      WHERE g."memberId" = m."id" AND g."organisationId" = m."organisationId" AND g."groupingId" = ${limit.groupingId}
      AND EXISTS (SELECT 1 FROM unnest(${[...limit.paths]}::text[]) AS p("path") WHERE v."path" = p."path" OR starts_with(v."path", p."path" || '/')))`);
  }
  if (input.q) {
    const pattern = likePattern(input.q);
    const matches = [Prisma.sql`m."name" ILIKE ${pattern}`];
    if (input.matchEmail) matches.push(Prisma.sql`m."email" ILIKE ${pattern}`);
    if (/^\d+$/.test(input.q)) matches.push(Prisma.sql`m."memberNumber" = ${Number(input.q)}`);
    conditions.push(Prisma.sql`(${Prisma.join(matches, " OR ")})`);
  }
  if (input.planId) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "MembershipTerm" t WHERE t."memberId" = m."id" AND t."organisationId" = m."organisationId" AND t."planId" = ${input.planId})`);
  if (input.unitId) conditions.push(Prisma.sql`m."unitId" = ${input.unitId}`);
  if (input.roleId) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "MemberRoleAssignment" a WHERE a."memberId" = m."id" AND a."roleId" = ${input.roleId})`);
  if (input.drillMemberIds) conditions.push(Prisma.sql`m."id" = ANY(${input.drillMemberIds}::text[])`);
  if (input.subtreePath) conditions.push(inSubtree(input.subtreePath));
  return conditions;
}

const hasTerm = (status: string) => Prisma.raw(`EXISTS (SELECT 1 FROM "MembershipTerm" t WHERE t."memberId" = m."id" AND t."organisationId" = m."organisationId" AND t."status" = '${status}')`);

function filterCondition(filter: MemberFilter, now: Date): Prisma.Sql {
  switch (filter) {
    case "active": return hasTerm("ACTIVE");
    case "approval": return hasTerm("PENDING_APPROVAL");
    case "payment": return hasTerm("PENDING_PAYMENT");
    case "grace": return hasTerm("GRACE");
    case "lapsed":
      return Prisma.sql`(${hasTerm("LAPSED")} AND NOT EXISTS (SELECT 1 FROM "MembershipTerm" t WHERE t."memberId" = m."id" AND t."organisationId" = m."organisationId" AND t."status" IN ('UPCOMING', 'ACTIVE', 'GRACE')))`;
    case "expiring":
      return Prisma.sql`EXISTS (SELECT 1 FROM "MembershipTerm" t WHERE t."memberId" = m."id" AND t."organisationId" = m."organisationId" AND t."status" = 'ACTIVE'
        AND t."endsAt" >= ${asUtc(now)} AND t."endsAt" <= ${asUtc(new Date(now.getTime() + 30 * DAY_MS))}
        AND NOT EXISTS (SELECT 1 FROM "MembershipTerm" r WHERE r."renewedFromId" = t."id" AND r."status" NOT IN ('CANCELLED', 'EXPIRED', 'REJECTED')))`;
    default: return Prisma.sql`TRUE`;
  }
}

export async function countDirectoryFilters(input: DirectoryCountInput): Promise<Record<MemberFilter, number>> {
  const columns = MEMBER_FILTERS.map((filter) => Prisma.sql`count(*) FILTER (WHERE ${filterCondition(filter, input.now)})::int AS ${Prisma.raw(`"${filter}"`)}`);
  const rows = await prisma.$queryRaw<Record<MemberFilter, number>[]>(
    Prisma.sql`SELECT ${Prisma.join(columns)} FROM "Member" m WHERE ${Prisma.join(baseConditions(input), " AND ")}`,
  );
  return Object.fromEntries(MEMBER_FILTERS.map((filter) => [filter, Number(rows[0]?.[filter] ?? 0)])) as Record<MemberFilter, number>;
}
