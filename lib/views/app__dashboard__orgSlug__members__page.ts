import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { deriveStatus } from "@/lib/membership/lifecycle";
import { memberWhere, teamScope, unitInScope } from "@/lib/membership/scope";
import { pathWithin } from "@/lib/membership/planUnits";
import { memberFilterWhere } from "@/lib/cards/exportFilter";

import { MEMBER_FILTERS, type MemberFilter } from "@/lib/membership/describe";
import { drillMemberIds, type DrillQuery } from "@/lib/reports/drill";
import { reportScope, scopedMemberWhere } from "@/lib/reports/source";

const PAGE_SIZE = 50;

type Search = { status?: string; q?: string; plan?: string; unit?: string; role?: string; page?: string } & DrillQuery;

const DRILL_PARAMS = ["drill", "period", "from", "to", "dunit", "dstate", "dsource", "dtenure"] as const;


/** The member directory: counts per filter, one page of members, and their standing on each plan. */
export async function loadOrgMembersDirectory({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<Search> }) {
  const { orgSlug } = await params;
  const search = await searchParams;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "members.view");
  const scope = await teamScope(organisation.id, membership.unitId);
  const now = new Date();
  const filter = (MEMBER_FILTERS as readonly string[]).includes(search.status ?? "") ? (search.status as MemberFilter) : "all";
  const q = (search.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(1000, Number.parseInt(search.page ?? "1", 10) || 1));
  // A report tile's drill-down: the members behind that number, inside this viewer's scope.
  const calendar = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { timezone: true, financialYearStartMonth: true } });
  const drill = search.drill ? await drillMemberIds(scope, search, calendar, now) : null;
  // A report's unit filter is a subtree (and never wider than the viewer's own scope).
  const subtree = !drill && search.dunit ? (await reportScope(scope, { unit: search.dunit })).unitPath : null;
  // Searching by email only for staff who may see email addresses, so nobody else can probe for one.
  const showContact = can(membership, "members.contact");

  const base: Prisma.MemberWhereInput = {
    ...memberWhere(scope),
    anonymisedAt: null,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, ...(showContact ? [{ email: { contains: q, mode: "insensitive" as const } }] : []), ...(/^\d+$/.test(q) ? [{ memberNumber: Number(q) }] : [])] } : {}),
    ...(search.plan ? { terms: { some: { planId: search.plan } } } : {}),
    ...(search.unit ? { unitId: search.unit } : {}),
    ...(search.role ? { roles: { some: { roleId: search.role } } } : {}),
    ...(drill ? { id: { in: drill.memberIds } } : {}),
    ...(subtree ? { AND: [scopedMemberWhere({ organisationId: organisation.id, unitPath: subtree })] } : {}),
  };
  const where: Prisma.MemberWhereInput = { AND: [base, memberFilterWhere(filter, now)] };

  const [org, counts, total, members, plans, units, roles] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, timezone: true } }),
    Promise.all(MEMBER_FILTERS.map((key) => prisma.member.count({ where: { AND: [base, memberFilterWhere(key, now)] } }))),
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, memberNumber: true, name: true, email: true, phone: true, createdAt: true,
        unit: { select: { name: true } },
        roles: { select: { isPrimary: true, role: { select: { name: true, color: true } } }, orderBy: { isPrimary: "desc" } },
        terms: { select: { id: true, planId: true, status: true, startsAt: true, endsAt: true, graceUntil: true, paymentDueBy: true, renewedFromId: true, createdAt: true } },
      },
    }),
    prisma.membershipPlan.findMany({ where: { organisationId: organisation.id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.orgUnit.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { path: "asc" }, select: { id: true, name: true, level: true, path: true } }),
    prisma.memberRole.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, unit: { select: { path: true } } } }),
  ]);
  // A scoped viewer is offered the roles that can apply to someone in their units: unlimited ones, and those whose unit overlaps their subtree.
  const reach = scope.unitPath;
  const offeredRoles = roles
    .filter((role) => !reach || !role.unit || pathWithin(role.unit.path, reach) || pathWithin(reach, role.unit.path))
    .map(({ id, name }) => ({ id, name }));

  const planName = new Map(plans.map((plan) => [plan.id, plan.name]));
  const rows = members.map((member) => {
    const byPlan = new Map<string, typeof member.terms>();
    for (const term of member.terms) byPlan.set(term.planId, [...(byPlan.get(term.planId) ?? []), term]);
    const standings = [...byPlan.entries()].map(([planId, chain]) => {
      const derived = deriveStatus(chain, now);
      return { planId, planName: planName.get(planId) ?? "Plan", status: derived.status, endsAt: derived.current?.endsAt ?? null, pendingTermId: derived.pending?.status === "PENDING_APPROVAL" ? derived.pending.id : null };
    });
    return {
      id: member.id,
      memberNumber: member.memberNumber,
      name: member.name,
      email: showContact ? member.email : null,
      unit: member.unit?.name ?? null,
      roles: member.roles.map((assignment) => ({ ...assignment.role, primary: assignment.isPrimary })),
      standings,
      joinedAt: member.createdAt,
    };
  });

  return {
    org,
    filter,
    q,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    counts: Object.fromEntries(MEMBER_FILTERS.map((key, index) => [key, counts[index]])) as Record<MemberFilter, number>,
    rows,
    plans,
    units: units.filter((unit) => unitInScope(scope, unit.path)).map(({ id, name, level }) => ({ id, name, level })),
    roles: offeredRoles,
    selected: { plan: search.plan ?? "", unit: search.unit ?? "", role: search.role ?? "" },
    canManage: can(membership, "members.manage"),
    canExport: can(membership, "members.export"),
    canManageCards: can(membership, "cards.manage"),
    scopedUnit: scope.unitId !== null,
    drill: drill || subtree ? { label: drill?.label ?? "Unit and everything under it", params: Object.fromEntries(DRILL_PARAMS.flatMap((key) => (search[key] ? [[key, String(search[key])]] : []))) as Record<string, string> } : null,
  };
}
