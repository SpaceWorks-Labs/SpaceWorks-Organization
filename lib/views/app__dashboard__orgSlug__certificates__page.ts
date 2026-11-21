import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { memberWhere, teamScope } from "@/lib/membership/scope";
import { certificateState, certificateVerifyPath } from "@/lib/certificates/core";
import { loadCertificateOrgContext } from "@/lib/certificates/data";
import { certificateDraftDiffers } from "@/lib/certificates/draft";
import { requireCertificatesAccess } from "@/lib/certificates/pageAccess";
import { pageDimensions, readPage } from "@/lib/certificates/pages";

const PAGE_SIZE = 25;
const STATUSES = ["all", "valid", "revoked"] as const;

/**
 * The certificates page: the organisation's designs with how many certificates each has issued inside the viewer's
 * reach, and the issued certificates themselves, filtered by design, status (valid, revoked, all) and a search of
 * the member's name or the certificate number, 25 a page, newest first. Counts and rows only cover members the
 * viewer may see.
 */
export async function loadCertificatesView({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ design?: string; status?: string; q?: string; page?: string }> }) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const { organisation, membership } = await requireCertificatesAccess(orgSlug, "view");
  const ctx = await loadCertificateOrgContext(organisation.id);
  if (!ctx) notFound();
  const scope = await teamScope(organisation.id, membership);
  const inScope = { member: memberWhere(scope) } satisfies Prisma.CertificateWhereInput;
  const context = { organisationName: ctx.organisation.name };

  const status = (STATUSES as readonly string[]).includes(query.status ?? "") ? (query.status as (typeof STATUSES)[number]) : "all";
  const designs = await prisma.certificateDesign.findMany({ where: { organisationId: organisation.id }, orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }] });
  const designId = designs.some((item) => item.id === query.design) ? query.design! : null;
  const text = (query.q ?? "").trim().slice(0, 80);
  const where: Prisma.CertificateWhereInput = {
    organisationId: organisation.id,
    ...inScope,
    ...(designId ? { designId } : {}),
    ...(status === "valid" ? { revokedAt: null } : status === "revoked" ? { revokedAt: { not: null } } : {}),
    ...(text ? { OR: [{ certificateNumber: { contains: text, mode: "insensitive" } }, { member: { name: { contains: text, mode: "insensitive" } } }] } : {}),
  };
  const page = Math.max(1, Math.min(10_000, Number.parseInt(query.page ?? "1", 10) || 1));
  const [issued, valid, total, rows] = await Promise.all([
    prisma.certificate.groupBy({ by: ["designId"], where: { organisationId: organisation.id, ...inScope }, _count: { _all: true } }),
    prisma.certificate.groupBy({ by: ["designId"], where: { organisationId: organisation.id, revokedAt: null, ...inScope }, _count: { _all: true } }),
    prisma.certificate.count({ where }),
    prisma.certificate.findMany({
      where, orderBy: [{ issuedAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, certificateNumber: true, title: true, issuedAt: true, revokedAt: true, verifyToken: true, memberId: true, member: { select: { name: true } }, design: { select: { name: true } } },
    }),
  ]);
  const count = (list: typeof issued, id: string) => list.find((entry) => entry.designId === id)?._count._all ?? 0;

  return {
    org: { name: ctx.organisation.name, slug: ctx.organisation.slug, logoUrl: ctx.organisation.logoUrl, timeZone: ctx.organisation.timezone },
    designs: designs.map((row) => {
      const live = readPage(row);
      return {
        id: row.id,
        name: row.name,
        typeLabel: row.typeLabel,
        pageSize: live.pageSize,
        orientation: live.orientation,
        ...pageDimensions(live.pageSize, live.orientation),
        /** Approved: certificates can be issued from it. */
        live: row.design !== null,
        hasDraft: row.draft !== null,
        /** A draft that would change issued certificates once approved. */
        pending: certificateDraftDiffers(row, context),
        archived: row.archivedAt !== null,
        numberFormat: row.numberFormat,
        draftUpdatedAt: row.draft ? row.draftUpdatedAt?.toISOString() ?? null : null,
        approvedAt: row.approvedAt?.toISOString() ?? null,
        issuedCount: count(issued, row.id),
        validCount: count(valid, row.id),
      };
    }),
    certificates: {
      rows: rows.map((row) => ({
        id: row.id, number: row.certificateNumber, title: row.title, memberId: row.memberId, memberName: row.member.name, designName: row.design.name,
        issuedAt: row.issuedAt.toISOString(), state: certificateState(row), verifyPath: certificateVerifyPath(row.verifyToken),
      })),
      total, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    },
    filters: { design: designId, status, q: text },
    canDesign: can(membership, "certificates.design", { write: true }),
    canIssue: can(membership, "certificates.issue"),
    canApprove: can(membership, "certificates.approve"),
    /** Limited to a unit or grouping: counts and lists cover only that reach. */
    scoped: scope.unitPath !== null || scope.limits.length > 0,
  };
}
