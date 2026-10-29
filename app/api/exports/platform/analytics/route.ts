import { auth } from "@/lib/auth";
import { ANALYTICS_TTL_SECONDS, cached, platformCacheKey } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { checkRateLimitById } from "@/lib/rateLimit";
import { auditedCsvResponse } from "@/lib/reports/exports/stream";
import { comparisonCsv, parseSort, sortComparison, tableCurrencies } from "@/lib/reports/platformAnalytics";
import { loadPlatformAnalytics } from "@/lib/reports/platformAnalyticsSource";

export const dynamic = "force-dynamic";

function refuse(status: number, message: string) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * H7 organisation comparison as CSV, for platform super admins only, streamed and audited as
 * PLATFORM_REPORT_EXPORTED (who, the sort and the row count). Aggregates only: no member's personal data.
 */
export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return refuse(401, "Sign in to export reports.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true, emailVerified: true } });
  if (!user?.isSuperAdmin || !user.emailVerified) return refuse(404, "Not found.");
  if (!(await checkRateLimitById("reportExport", `user:${userId}`))) return refuse(429, "Too many exports. Try again later.");
  const search = new URL(request.url).searchParams;
  const order = parseSort(search.get("sort") ?? undefined, search.get("dir") ?? undefined);
  const now = new Date();
  const data = await cached(platformCacheKey("analytics"), ANALYTICS_TTL_SECONDS, () => loadPlatformAnalytics(now));
  const currencies = tableCurrencies(data.rows);
  const csv = comparisonCsv(sortComparison(data.rows, order.key, order.dir, currencies[0] ?? "INR"), currencies);
  return auditedCsvResponse({
    header: csv.header,
    rows: csv.rows,
    filename: `organisations-${now.toISOString().slice(0, 10)}.csv`,
    audit: { action: "PLATFORM_REPORT_EXPORTED", actorUserId: userId, organisationId: null, report: "organisation-comparison", filters: { sort: order.key, dir: order.dir } },
  });
}
