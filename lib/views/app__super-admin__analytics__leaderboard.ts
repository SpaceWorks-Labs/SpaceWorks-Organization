import { ANALYTICS_TTL_SECONDS, cached, platformCacheKey } from "@/lib/cache";
import { requireSuperAdmin } from "@/lib/permissions";
import { leaderboardRows, pageLeaderboard, parseLeaderboardQuery, LEADERBOARD_SORTS, LEADERBOARD_STATUSES, LEADERBOARD_PAGE_SIZES } from "@/lib/reports/platformLeaderboard";
import { loadLeaderboardFacts } from "@/lib/reports/platformLeaderboardSource";
import { platformWindow, PLATFORM_RANGES } from "@/lib/reports/platformRange";

type Props = { searchParams: Promise<{ range?: string; sort?: string; dir?: string; page?: string; pageSize?: string; status?: string; currency?: string }> };

/**
 * The organisation leaderboard for a range: one row per live organisation, sortable and paginated. Counts and
 * money per currency only; each row links to that organisation's analytics. The facts are cached per range; the
 * sort, filter and page are applied after.
 */
export async function loadSuperAdminLeaderboardView({ searchParams }: Props) {
  await requireSuperAdmin();
  const params = await searchParams;
  const now = new Date();
  const window = platformWindow(params.range, now);
  const query = parseLeaderboardQuery(params);
  const facts = await cached(platformCacheKey("analytics", "leaderboard", window.range), ANALYTICS_TTL_SECONDS, () => loadLeaderboardFacts(window));
  const page = pageLeaderboard(leaderboardRows(facts), query);
  return {
    now,
    ranges: PLATFORM_RANGES,
    range: window.range,
    label: window.label,
    sorts: LEADERBOARD_SORTS,
    statuses: LEADERBOARD_STATUSES,
    pageSizes: LEADERBOARD_PAGE_SIZES,
    sort: query.sort,
    dir: query.dir,
    status: query.status,
    ...page,
  };
}

export type SuperAdminLeaderboardView = Awaited<ReturnType<typeof loadSuperAdminLeaderboardView>>;
