import { prisma } from "@/lib/db";
import { openReport, reportShell } from "@/lib/reports/shell";
import { loadOfflineCollections } from "@/lib/reports/finance/source";
import { cashInHand, type CashGroup } from "@/lib/reports/finance/cashInHand";
import type { ReportSearch } from "@/lib/reports/context";

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

/**
 * Cash in hand: offline money the team recorded in the period, net of refunds, per collector and per unit, in the
 * viewer's scope. Needs finance reports. Every figure stays in its own currency.
 */
export async function loadOrgReportsCash({ params, searchParams }: Props) {
  const ctx = await openReport(params, searchParams, "reports.finance");
  const { period, scope, org } = ctx;
  const report = cashInHand(await loadOfflineCollections(scope, period), period, org.currency);
  const collectors = await prisma.user.findMany({ where: { id: { in: report.byCollector.map((row) => row.key) } }, select: { id: true, name: true, email: true } });
  // Staff limited to a unit see names only, never the emails of colleagues outside their reach.
  const collectorName = new Map(collectors.map((user) => [user.id, user.name || (ctx.team.unitPath ? null : user.email) || "Team member"]));
  const unitName = new Map(ctx.allUnits.map((unit) => [unit.id, unit.name]));
  const plain = (row: CashGroup, label: string) => ({ ...row, label, oldest: row.oldest.toISOString() });
  return {
    shell: reportShell(ctx, "cash"),
    locale: org.locale,
    timezone: org.timezone,
    held: report.held,
    awaiting: report.awaiting,
    payments: report.payments,
    byCollector: report.byCollector.map((row) => plain(row, collectorName.get(row.key) ?? "Former team member")),
    byUnit: ctx.allUnits.length ? report.byUnit.map((row) => plain(row, row.key === "none" ? "No unit" : unitName.get(row.key) ?? "Archived unit")) : [],
  };
}

export type OrgReportsCash = Awaited<ReturnType<typeof loadOrgReportsCash>>;
