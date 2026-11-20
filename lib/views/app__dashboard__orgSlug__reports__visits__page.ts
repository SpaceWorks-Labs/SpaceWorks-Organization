import { requireOrgCapability } from "@/lib/permissions";
import { buildReportContext, type ReportSearch } from "@/lib/reports/context";
import { dayKey } from "@/lib/reports/period";
import { reportShell } from "@/lib/reports/shell";
import { loadVisitSummary } from "@/lib/visits/read";

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

/**
 * Web visits: public-page views by day and by page, counted by this site itself (no cookie, no person). It is
 * organisation-wide public information, not member data, so anyone who reads reports sees it, including staff
 * limited to a unit; the unit and plan filters do not apply to it. Days are UTC days.
 */
export async function loadOrgVisitsReport({ params, searchParams }: Props) {
  const { orgSlug } = await params;
  const access = await requireOrgCapability(orgSlug, "reports.membership");
  const ctx = await buildReportContext(access, { ...(await searchParams), period: (await searchParams).period ?? "30d" });
  const summary = await loadVisitSummary(ctx.org.id, dayKey(ctx.period.firstDay), dayKey(ctx.period.lastDay));
  return { shell: reportShell(ctx, "visits"), summary, period: ctx.period.preset, periodLabel: ctx.period.label, exportQuery: ctx.period.preset === "custom" ? `?period=custom&from=${dayKey(ctx.period.firstDay)}&to=${dayKey(ctx.period.lastDay)}` : `?period=${ctx.period.preset}` };
}
