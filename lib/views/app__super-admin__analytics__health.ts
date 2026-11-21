import { ANALYTICS_TTL_SECONDS, cached, platformCacheKey } from "@/lib/cache";
import { requireSuperAdmin } from "@/lib/permissions";
import { OPS_DAY_RANGES, opsWindow } from "@/lib/reports/platformOps";
import { loadPlatformOperations } from "@/lib/reports/platformOpsSource";

type Props = { searchParams: Promise<{ days?: string }> };

/**
 * Operations health over the last 7, 30 or 90 days: outbox, emails, member messages per channel, team chat alerts,
 * SMS codes, sign-in security, job heartbeats and storage. Counts, ages and bytes only: no address, number,
 * message text, IP or error text.
 */
export async function loadSuperAdminOperationsHealthView({ searchParams }: Props) {
  await requireSuperAdmin();
  const now = new Date();
  const window = opsWindow((await searchParams).days, now);
  const data = await cached(platformCacheKey("analytics", "health", String(window.days)), ANALYTICS_TTL_SECONDS, () => loadPlatformOperations(window, now));
  return { now, dayRanges: OPS_DAY_RANGES, from: window.from, to: window.to, ...data };
}

export type SuperAdminOperationsHealthView = Awaited<ReturnType<typeof loadSuperAdminOperationsHealthView>>;
