import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { loadAreaEntries } from "@/lib/publicPage/areaData";
import { loadPublicCounts } from "@/lib/publicPage/counts";
import { loadStatsCatalogue } from "@/lib/publicPage/liveStats";
import { sampleCardFor } from "@/lib/publicPage/sampleCard";
import { loadStoredPage } from "@/lib/publicPage/server";
import { isPageImageKeyFor, starterDocument } from "@/lib/publicPage/sections";

/**
 * The public page editor: what is published, the working draft (or the published page, or a starter
 * document for a first edit), and the live plans, units, counts (the same suppressed aggregates visitors would see)
 * and sample card the preview shows.
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
  // Every count, so a counts section added in the editor previews straight away; still aggregates, small ones removed.
  const groupings = await prisma.orgGrouping.findMany({ where: { organisationId: organisation.id, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  const [counts, sampleCard, statsCatalogue, areas, images] = await Promise.all([
    loadPublicCounts(organisation.id, { total: true, byPlan: true, byUnit: true }),
    sampleCardFor(org),
    loadStatsCatalogue(organisation.id, groupings, org),
    loadAreaEntries({ ...org, website: org.website }, org.status === "ACTIVE"),
    // The organisation's own uploaded page images (never page files), newest first, for the editor's image pickers.
    prisma.asset.findMany({ where: { organisationId: organisation.id, key: { startsWith: `organisations/${organisation.id}/page-images/` } }, orderBy: { createdAt: "desc" }, take: 60, select: { key: true } }),
  ]);
  return {
    org,
    canEdit: can(membership, "org.settings", { write: true }),
    publishedAt: stored.publishedAt,
    hasDraft: Boolean(stored.draft),
    /** What visitors see now (null when unpublished), for Discard draft and "changed since publishing". */
    published: stored.published,
    draftSavedAt: stored.draftSavedAt,
    revision: stored.revision,
    document: working,
    plans,
    units,
    counts,
    sampleCard,
    /** Every numbers metric the editor can offer, organisation-wide (use `statsForSection` to pick a block's). */
    statsCatalogue,
    /** Every area with its contact and join plans, for the areas directory preview. */
    areas,
    /** The organisation's groupings, for the numbers block's "by grouping" picker. */
    groupings,
    /** Keys of the organisation's uploaded page images, newest first. */
    pageImages: images.map((image) => image.key).filter((key) => isPageImageKeyFor(key, organisation.id)),
  };
}
