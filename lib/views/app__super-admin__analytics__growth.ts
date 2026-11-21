import { ANALYTICS_TTL_SECONDS, cached, platformCacheKey } from "@/lib/cache";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadPlatformGrowth, loadPlatformMoney } from "@/lib/reports/platformGrowthSource";
import { platformWindow, PLATFORM_RANGES } from "@/lib/reports/platformRange";

type Props = { searchParams: Promise<{ range?: string }> };

/**
 * Platform growth and health for a range (30d, 90d, 12m, fy): every headline against the previous period,
 * organisations by status, and per-bucket series. Counts only, never a member's details.
 */
export async function loadSuperAdminGrowthView({ searchParams }: Props) {
  await requireSuperAdmin();
  const now = new Date();
  const window = platformWindow((await searchParams).range, now);
  const data = await cached(platformCacheKey("analytics", "growth", window.range), ANALYTICS_TTL_SECONDS, () => loadPlatformGrowth(window));
  return { now, ranges: PLATFORM_RANGES, range: window.range, label: window.label, unit: window.unit, from: window.from, to: window.to, previous: window.previous, ...data };
}

export type SuperAdminGrowthView = Awaited<ReturnType<typeof loadSuperAdminGrowthView>>;

/** Platform money by currency for a range: per currency totals, the previous-period comparison, online against in hand, owed now, and a point per bucket. Never added across currencies. */
export async function loadSuperAdminMoneyView({ searchParams }: Props) {
  await requireSuperAdmin();
  const now = new Date();
  const window = platformWindow((await searchParams).range, now);
  const currencies = await cached(platformCacheKey("analytics", "money", window.range), ANALYTICS_TTL_SECONDS, () => loadPlatformMoney(window));
  return { now, ranges: PLATFORM_RANGES, range: window.range, label: window.label, unit: window.unit, from: window.from, to: window.to, previous: window.previous, currencies };
}

export type SuperAdminMoneyView = Awaited<ReturnType<typeof loadSuperAdminMoneyView>>;
