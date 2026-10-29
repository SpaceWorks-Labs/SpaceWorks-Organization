import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimitById } from "@/lib/rateLimit";
import { can, organisationAllows, type Capability } from "@/lib/permissionRoles";
import { getMembership, hasAuthenticator, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { buildReportContext } from "@/lib/reports/context";
import { auditedCsvResponse } from "@/lib/reports/exports/stream";
import { approvalsExport, cohortsExport, lapsedExport, registerExport, unitsExport, worklistExport, type Built } from "@/lib/reports/exports/membership";
import { documentsExport, gstr1Export, outstandingExport, revenueExport } from "@/lib/reports/exports/finance";
import type { ReportContext } from "@/lib/reports/context";

export const dynamic = "force-dynamic";

type Builder = (ctx: ReportContext, search: URLSearchParams) => Promise<Built>;

/** Every report export, its capability and whether it is a finance export (audited as such). */
const REPORTS: Record<string, { capability: Capability; finance: boolean; build: Builder }> = {
  register: { capability: "reports.membership", finance: false, build: registerExport },
  worklist: { capability: "reports.membership", finance: false, build: worklistExport },
  lapsed: { capability: "reports.membership", finance: false, build: lapsedExport },
  approvals: { capability: "reports.membership", finance: false, build: approvalsExport },
  cohorts: { capability: "reports.membership", finance: false, build: cohortsExport },
  units: { capability: "reports.membership", finance: false, build: unitsExport },
  revenue: { capability: "reports.finance", finance: true, build: revenueExport },
  outstanding: { capability: "reports.finance", finance: true, build: outstandingExport },
  documents: { capability: "reports.finance", finance: true, build: documentsExport },
  gstr1: { capability: "reports.finance", finance: true, build: gstr1Export },
};

function refuse(status: number, message: string) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * A report as CSV, streamed and audited (who, report, filters, row count). Same tenant, status, role and
 * unit-scope checks as the report page; anything outside the organisation is a 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orgSlug: string; report: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return refuse(401, "Sign in to export reports.");
  const { orgSlug, report } = await params;
  const definition = Object.hasOwn(REPORTS, report) ? REPORTS[report] : null;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, slug: true, status: true } });
  const membership = org ? await getMembership(userId, org.id) : null;
  if (!org || !membership || !definition) return refuse(404, "Not found.");
  if (!(await hasAuthenticator(userId))) return refuse(403, STAFF_AUTHENTICATOR_MESSAGE);
  if (!organisationAllows(org.status, definition.capability) || !can(membership, definition.capability)) return refuse(403, "Your role can't export this report.");
  if (!(await checkRateLimitById("reportExport", `user:${userId}`))) return refuse(429, "Too many exports. Try again later.");

  const search = new URL(request.url).searchParams;
  const ctx = await buildReportContext({ organisation: org, membership, userId }, Object.fromEntries(search));
  const built = await definition.build(ctx, search);
  return auditedCsvResponse({
    header: built.header,
    rows: built.rows,
    filename: `${org.slug}-${report}-${ctx.period.preset === "custom" ? `${search.get("from")}-${search.get("to")}` : ctx.period.preset}.csv`,
    audit: {
      action: definition.finance ? "FINANCE_REPORT_EXPORTED" : "REPORT_EXPORTED",
      actorUserId: userId,
      organisationId: org.id,
      report,
      filters: { period: ctx.filters.period, from: ctx.filters.from || null, to: ctx.filters.to || null, plan: ctx.filters.plan || null, unit: ctx.scope.unitId, scoped: ctx.scope.scoped, ...built.filters },
    },
  });
}
