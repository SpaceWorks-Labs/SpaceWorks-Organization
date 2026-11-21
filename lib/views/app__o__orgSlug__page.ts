import { PUBLIC_PAGE_TTL_SECONDS, cached, orgCacheKey } from "@/lib/cache";
import { loadPublicOrganisation } from "@/lib/publicOrganisation";
import { loadPublicContent } from "@/lib/publicPage/content";

/**
 * The public page: the organisation's story and the plans people can join. With a published custom page
 * its sections render; otherwise the plain page shows. The organisation (status, branding) is read live; its
 * plans, published page, units, live counts and numbers (aggregates only, small counts removed), areas directory and
 * sample card are cached for a few minutes and dropped when plans, members or the page change. Only the published
 * document is ever read here; drafts never reach a visitor.
 */
export async function loadPublicOrgPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await loadPublicOrganisation(orgSlug);
  const { plans, page, units, counts, sampleCard, liveStats, areas } = await cached(orgCacheKey(org.id, "public-page"), PUBLIC_PAGE_TTL_SECONDS, () => loadPublicContent(org, null));
  return { org, plans, takingMembers: org.status === "ACTIVE", page, units, counts: counts ?? null, sampleCard: sampleCard ?? null, liveStats: liveStats ?? null, areas: areas ?? [], area: null };
}
