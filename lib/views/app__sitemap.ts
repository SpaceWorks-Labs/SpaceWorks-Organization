import { prisma } from "@/lib/db";
import { cached, platformCacheKey } from "@/lib/cache";

const SITEMAP_TTL_SECONDS = 3600;
/** A sitemap file holds at most 50,000 URLs (and the fixed pages take a few); past this, split with generateSitemaps(). */
const SITEMAP_ORGANISATION_LIMIT = 49_000;
const SITEMAP_AREA_LIMIT = 20_000;

/** An organisation's area pages (/o/<slug>/a/<code>), listed in the sitemap only for organisations with a published page. */
export type SitemapArea = { slug: string; code: string; updatedAt: Date };

/** Listed, active organisations for the sitemap, kept for an hour (crawlers ask often; the list changes rarely). */
export async function loadSitemapOrganisations() {
  return cached(platformCacheKey("sitemap", "organisations"), SITEMAP_TTL_SECONDS, () =>
    prisma.organisation.findMany({
      where: { status: "ACTIVE", visibility: "PUBLIC" },
      orderBy: { slug: "asc" },
      take: SITEMAP_ORGANISATION_LIMIT,
      select: { slug: true, updatedAt: true },
    }),
  );
}

/** Area pages of listed, active organisations that published a page, capped, kept for an hour. */
export async function loadSitemapAreas(): Promise<SitemapArea[]> {
  return cached(platformCacheKey("sitemap", "areas"), SITEMAP_TTL_SECONDS, async () => {
    const rows = await prisma.orgUnit.findMany({
      where: { archivedAt: null, organisation: { status: "ACTIVE", visibility: "PUBLIC", page: { publishedAt: { not: null } } } },
      orderBy: [{ organisationId: "asc" }, { path: "asc" }],
      take: SITEMAP_AREA_LIMIT,
      select: { code: true, createdAt: true, organisation: { select: { slug: true } } },
    });
    return rows.map((row) => ({ slug: row.organisation.slug, code: row.code, updatedAt: row.createdAt }));
  });
}
