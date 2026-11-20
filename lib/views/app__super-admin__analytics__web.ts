import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/permissions";
import { configuredProviders, type ConfiguredProvider } from "@/lib/telemetry/configured";
import { parseOrgTelemetry } from "@/lib/telemetry/organisation";
import { loadVisitSummary, loadVisitTotalsByOrganisation, recentDays } from "@/lib/visits/read";

const DAYS = 30;

/**
 * The web analytics section of the platform analytics page: the platform's own public-page visits, every
 * organisation's visits, and which organisations have outside providers set up (names and purposes only, never ids).
 * Aggregates only: no member data.
 */
export async function loadSuperAdminWebAnalyticsView() {
  await requireSuperAdmin();
  const { firstDay, lastDay } = recentDays(DAYS);
  const [platform, totals, configured] = await Promise.all([
    loadVisitSummary(null, firstDay, lastDay),
    loadVisitTotalsByOrganisation(firstDay, lastDay),
    prisma.organisation.findMany({
      where: { webTelemetry: { not: Prisma.DbNull }, status: { in: ["ACTIVE", "SUSPENDED"] } },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, slug: true, webTelemetry: true },
    }),
  ]);
  const organisations = configured.flatMap((org) => {
    const providers: ConfiguredProvider[] = configuredProviders(parseOrgTelemetry(org.webTelemetry).config, null);
    return providers.length ? [{ id: org.id, name: org.name, slug: org.slug, providers, visits: totals[org.id] ?? 0 }] : [];
  });
  return { days: DAYS, platform, organisations, organisationVisits: Object.values(totals).reduce((sum, value) => sum + value, 0) };
}

export type SuperAdminWebAnalyticsView = Awaited<ReturnType<typeof loadSuperAdminWebAnalyticsView>>;
