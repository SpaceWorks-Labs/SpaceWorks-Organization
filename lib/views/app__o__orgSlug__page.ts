import { PUBLIC_PAGE_TTL_SECONDS, cached, orgCacheKey } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { loadPublicOrganisation } from "@/lib/publicOrganisation";
import { loadStoredPage } from "@/lib/publicPage/server";

/**
 * The public page: the organisation's story and the plans people can join. With a published custom page
 * its sections render; otherwise the plain page shows. The organisation (status, branding) is read live; its
 * plans, published page and units are cached for a few minutes and dropped when plans or the page change.
 */
export async function loadPublicOrgPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await loadPublicOrganisation(orgSlug);
  const { plans, page, units } = await cached(orgCacheKey(org.id, "public-page"), PUBLIC_PAGE_TTL_SECONDS, () => publicContent(org.id));
  return { org, plans, takingMembers: org.status === "ACTIVE", page, units };
}

/** What every visitor sees on the page, the same for all of them. */
async function publicContent(organisationId: string) {
  const [plans, stored] = await Promise.all([
    prisma.membershipPlan.findMany({
      where: { organisationId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true, slug: true, description: true, currency: true, durationType: true, durationMonths: true, fixedEndDate: true,
        priceNewMinor: true, priceRenewalMinor: true, joiningFeeMinor: true, joinMode: true, allUnits: true,
        units: { select: { unit: { select: { name: true } } } },
      },
    }),
    loadStoredPage(organisationId),
  ]);
  const page = stored.published;
  const units = page?.sections.some((section) => section.type === "units" && section.visible)
    ? await prisma.orgUnit.findMany({ where: { organisationId, archivedAt: null }, orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true, parentId: true }, take: 500 })
    : [];
  return { plans, page, units };
}
