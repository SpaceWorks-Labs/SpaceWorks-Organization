import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { recordThrottledAuditEvent } from "@/lib/audit";
import { auditRowSelect } from "@/components/super-admin/AuditTable";

type Props = {
  params: Promise<{ orgId: string }>;
};

export async function loadSuperAdminOrgDetailView({ params }: Props) {
  // Layout checks don't re-run on client navigation, so every page checks too.
  const session = await requireSuperAdmin();
  const { orgId } = await params;

  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: {
      id: true, name: true, slug: true, description: true, logoUrl: true, status: true, source: true, kind: true,
      contactEmail: true, contactPhone: true, addressLine: true, city: true, stateCode: true, postalCode: true, country: true, website: true,
      memberLimit: true, managerLimit: true, visibility: true, createdAt: true, updatedAt: true,
      _count: { select: { teamMembers: true } },
    },
  });
  if (!org) notFound();
  // A8: a platform admin opening an organisation's data is audited (once per half hour per organisation).
  await recordThrottledAuditEvent({ action: "SUPER_ADMIN_ORG_VIEWED", actorUserId: session.user.id, organisationId: org.id, targetType: "Organisation", targetId: org.id, windowMs: 30 * 60_000 }).catch(() => undefined);

  const [reviews, members, invites, assetStats, auditEvents] = await Promise.all([
    prisma.organisationReview.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, reason: true, createdAt: true, actor: { select: { name: true, email: true } } },
    }),
    prisma.teamMember.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, orgRole: { select: { name: true, isOwner: true } }, createdAt: true, user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.teamInvite.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, orgRole: { select: { name: true, isOwner: true } }, email: true, createdAt: true, expiresAt: true, usedAt: true, usedBy: { select: { email: true } } },
    }),
    prisma.asset.aggregate({ where: { organisationId: org.id }, _count: { _all: true }, _sum: { byteSize: true } }),
    prisma.auditEvent.findMany({ where: { organisationId: org.id }, orderBy: { createdAt: "desc" }, take: 25, select: auditRowSelect }),
  ]);

  return { org, reviews, members, invites, assetStats, auditEvents, now: new Date() };
}
