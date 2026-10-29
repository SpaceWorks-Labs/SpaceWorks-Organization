import { ANALYTICS_TTL_SECONDS, cached, platformCacheKey } from "@/lib/cache";
import { requireSuperAdmin } from "@/lib/permissions";
import { parseSort, sortComparison, tableCurrencies } from "@/lib/reports/platformAnalytics";
import { loadPlatformAnalytics } from "@/lib/reports/platformAnalyticsSource";

type Props = { searchParams: Promise<{ sort?: string; dir?: string }> };

/**
 * H7 platform analytics: every organisation side by side (sortable), and the platform trends. Counts and money
 * per currency only; no member's personal data appears here.
 */
export async function loadSuperAdminAnalyticsView({ searchParams }: Props) {
  await requireSuperAdmin();
  const { sort, dir } = await searchParams;
  const now = new Date();
  // Cached for a few minutes (lib/cache.ts): platform aggregates only, the same for every super admin.
  const data = await cached(platformCacheKey("analytics"), ANALYTICS_TTL_SECONDS, () => loadPlatformAnalytics(now));
  const order = parseSort(sort, dir);
  const currencies = tableCurrencies(data.rows);
  return {
    now,
    sort: order,
    currencies,
    rows: sortComparison(data.rows, order.key, order.dir, currencies[0] ?? "INR"),
    dormant: data.rows.filter((row) => row.dormant).length,
    trends: data.trends,
  };
}

export type SuperAdminAnalyticsView = Awaited<ReturnType<typeof loadSuperAdminAnalyticsView>>;
