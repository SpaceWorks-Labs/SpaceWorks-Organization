import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimitById } from "@/lib/rateLimit";
import { can, organisationAllows } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { buildReportContext } from "@/lib/reports/context";
import { dayKey } from "@/lib/reports/period";
import { routeLabel } from "@/lib/reports/visits";
import { auditedCsvResponse } from "@/lib/reports/exports/stream";

export const dynamic = "force-dynamic";

function refuse(status: number, message: string) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

/** The visits report as CSV: one row per day and page, counts only. Same checks as the report page; other organisations are a 404. */
export async function GET(request: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const userId = (await auth())?.user?.id;
  if (!userId) return refuse(401, "Sign in to export reports.");
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, slug: true, status: true } });
  const membership = org ? await getMembership(userId, org.id) : null;
  if (!org || !membership) return refuse(404, "Not found.");
  if (!(await hasAuthenticator(userId))) return refuse(403, STAFF_AUTHENTICATOR_MESSAGE);
  if (!organisationAllows(org.status, "reports.membership") || !can(membership, "reports.membership")) return refuse(403, "Your role can't export this report.");
  if (!(await checkRateLimitById("reportExport", `user:${userId}`))) return refuse(429, "Too many exports. Try again later.");

  const search = new URL(request.url).searchParams;
  const ctx = await buildReportContext({ organisation: org, membership, userId }, { period: search.get("period") ?? "30d", from: search.get("from") ?? undefined, to: search.get("to") ?? undefined });
  const first = dayKey(ctx.period.firstDay), last = dayKey(ctx.period.lastDay);
  const rows = await prisma.webVisitDaily.findMany({
    where: { organisationId: org.id, channel: "web", day: { gte: new Date(`${first}T00:00:00.000Z`), lte: new Date(`${last}T00:00:00.000Z`) } },
    orderBy: [{ day: "asc" }, { route: "asc" }],
    select: { day: true, route: true, count: true },
  });
  return auditedCsvResponse({
    header: ["Day (UTC)", "Page", "Route template", "Visits"],
    rows: rows.map((row) => [row.day.toISOString().slice(0, 10), routeLabel(row.route), row.route, row.count]),
    filename: `${org.slug}-visits-${first}-${last}.csv`,
    audit: { action: "REPORT_EXPORTED", actorUserId: userId, organisationId: org.id, report: "visits", filters: { period: ctx.filters.period, from: first, to: last } },
  });
}
