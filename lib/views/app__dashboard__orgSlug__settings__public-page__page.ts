import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { loadStoredPage } from "@/lib/publicPage/server";
import { starterDocument } from "@/lib/publicPage/sections";

/**
 * The public page editor: what is published, the working draft (or the published page, or a starter
 * document for a first edit), and the live plans and units the preview shows.
 */
export async function loadPublicPageEditorView({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "org.settings");
  const [org, stored, plans, units] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({
      where: { id: organisation.id },
      select: {
        id: true, name: true, slug: true, logoUrl: true, kind: true, description: true, accentColor: true, status: true, locale: true, timezone: true, financialYearStartMonth: true,
        contactEmail: true, contactPhone: true, city: true, stateCode: true, website: true, unitLevels: true,
      },
    }),
    loadStoredPage(organisation.id),
    prisma.membershipPlan.findMany({
      where: { organisationId: organisation.id, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true, slug: true, description: true, currency: true, durationType: true, durationMonths: true, fixedEndDate: true,
        priceNewMinor: true, priceRenewalMinor: true, joiningFeeMinor: true, joinMode: true, allUnits: true,
        units: { select: { unit: { select: { name: true } } } },
      },
    }),
    prisma.orgUnit.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, parentId: true }, take: 500 }),
  ]);
  const working = stored.draft ?? stored.published ?? starterDocument(org);
  return {
    org,
    canEdit: can(membership, "org.settings", { write: true }),
    publishedAt: stored.publishedAt,
    hasDraft: Boolean(stored.draft),
    revision: stored.revision,
    document: working,
    plans,
    units,
  };
}
