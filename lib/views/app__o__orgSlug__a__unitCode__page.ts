import { notFound } from "next/navigation";
import { PUBLIC_PAGE_TTL_SECONDS, cached, orgCacheKey } from "@/lib/cache";
import { loadPublicOrganisation } from "@/lib/publicOrganisation";
import { resolveArea } from "@/lib/publicPage/areaData";
import { loadPublicContent } from "@/lib/publicPage/content";

/**
 * An area's page, /o/<slug>/a/<code>: the organisation's same published page, seen for one area. Unknown, archived and
 * another organisation's codes, and organisations that are not active, are all a 404. The area's name and trail,
 * its contact, the plans offered to it, its sub-areas and subtree-scoped numbers come with it; every join link on
 * the page carries `?unit=CODE` (`area.code`). Cached per area under the organisation's public-page key.
 */
export async function loadPublicAreaPage({ params }: { params: Promise<{ orgSlug: string; unitCode: string }> }) {
  const { orgSlug, unitCode } = await params;
  const org = await loadPublicOrganisation(orgSlug);
  if (org.status !== "ACTIVE") notFound();
  const scope = await resolveArea(org, unitCode);
  const { plans, page, units, counts, sampleCard, liveStats, areas } = await cached(orgCacheKey(org.id, "public-page", `area-${scope.area.id}`), PUBLIC_PAGE_TTL_SECONDS, () => loadPublicContent(org, scope));
  return { org, plans, takingMembers: true, page, units, counts: counts ?? null, sampleCard: sampleCard ?? null, liveStats: liveStats ?? null, areas: areas ?? [], area: scope.area };
}
