import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { memberWhere, teamScope } from "@/lib/membership/scope";
import { ISSUE_LIMIT } from "@/lib/certificates/core";
import { requireCertificatesAccess } from "@/lib/certificates/pageAccess";
import { pageDimensions, readPage } from "@/lib/certificates/pages";

/**
 * The issue page: the designs certificates can be issued from (approved, not archived), the plans whose current
 * members can be chosen (with how many are inside the viewer's reach) and the smart groups. Recipients picked one
 * by one come from the `searchCertificateRecipients` action. Every number covers only members the viewer may see.
 */
export async function loadCertificateIssueView({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ design?: string }> }) {
  const { orgSlug } = await params;
  const { design: designParam } = await searchParams;
  const { organisation, membership } = await requireCertificatesAccess(orgSlug, "issue");
  const org = await prisma.organisation.findUnique({ where: { id: organisation.id }, select: { name: true, slug: true, logoUrl: true, memberPortal: true } });
  if (!org) notFound();
  const scope = await teamScope(organisation.id, membership);
  const [designs, plans, groups] = await Promise.all([
    prisma.certificateDesign.findMany({ where: { organisationId: organisation.id, archivedAt: null, design: { not: Prisma.DbNull } }, orderBy: { name: "asc" }, select: { id: true, name: true, typeLabel: true, pageSize: true, orientation: true } }),
    prisma.membershipPlan.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.smartGroup.findMany({ where: { organisationId: organisation.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const planCounts = await Promise.all(plans.map((plan) => prisma.member.count({ where: { AND: [memberWhere(scope), { anonymisedAt: null, terms: { some: { planId: plan.id, status: { in: ["ACTIVE", "GRACE"] } } } }] } })));

  return {
    org: { name: org.name, slug: org.slug, logoUrl: org.logoUrl },
    designs: designs.map((row) => ({ id: row.id, name: row.name, typeLabel: row.typeLabel, ...readPage(row), ...pageDimensions(readPage(row).pageSize, readPage(row).orientation) })),
    selectedDesignId: designs.find((row) => row.id === designParam)?.id ?? null,
    plans: plans.map((plan, index) => ({ id: plan.id, name: plan.name, memberCount: planCounts[index]! })),
    groups,
    /** At most this many certificates are issued in one request. */
    limit: ISSUE_LIMIT,
    scoped: scope.unitPath !== null || scope.limits.length > 0,
    canDesign: can(membership, "certificates.design"),
  };
}
