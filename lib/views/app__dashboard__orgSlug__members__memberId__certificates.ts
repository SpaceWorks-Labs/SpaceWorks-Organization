import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { organisationAllows } from "@/lib/permissionRoles";
import { memberWhere, teamScope } from "@/lib/membership/scope";
import { certificateState } from "@/lib/certificates/core";

/**
 * The certificates side of one member's page: their certificates, newest first, and whether the viewer may issue
 * one (an approved, unarchived design exists). Null for roles without either certificates permission, so the
 * panel does not show. Only members inside the viewer's reach are found.
 */
export async function loadMemberCertificates({ params }: { params: Promise<{ orgSlug: string; memberId: string }> }) {
  const { orgSlug, memberId } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "members.view");
  const may = (capability: "certificates.issue" | "certificates.design") => organisationAllows(organisation.status, capability) && can(membership, capability);
  if (!may("certificates.issue") && !may("certificates.design")) return null;
  const scope = await teamScope(organisation.id, membership);
  const member = await prisma.member.findFirst({ where: { AND: [memberWhere(scope), { id: memberId }] }, select: { id: true, anonymisedAt: true } });
  if (!member) notFound();
  const [rows, issuable] = await Promise.all([
    prisma.certificate.findMany({
      where: { organisationId: organisation.id, memberId: member.id },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { id: true, certificateNumber: true, title: true, issuedAt: true, revokedAt: true },
    }),
    prisma.certificateDesign.count({ where: { organisationId: organisation.id, archivedAt: null, design: { not: Prisma.DbNull } } }),
  ]);
  return {
    certificates: rows.map((row) => ({ id: row.id, number: row.certificateNumber, title: row.title, issuedAt: row.issuedAt.toISOString(), state: certificateState(row) })),
    canIssue: may("certificates.issue") && issuable > 0 && !member.anonymisedAt,
  };
}
