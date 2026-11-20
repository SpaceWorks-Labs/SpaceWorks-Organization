import { prisma } from "@/lib/db";
import { cached, platformCacheKey } from "@/lib/cache";

const SITEMAP_TTL_SECONDS = 3600;
/** A sitemap file holds at most 50,000 URLs (and the fixed pages take a few); past this, split with generateSitemaps(). */
const SITEMAP_ORGANISATION_LIMIT = 49_000;

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
