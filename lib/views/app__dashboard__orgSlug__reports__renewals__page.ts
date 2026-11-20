import { prepareDataset } from "@/lib/reports/dataset";
import { drillHref } from "@/lib/reports/drillLinks";
import { membershipSummary } from "@/lib/reports/metrics/flows";
import { cohortRetention, fyCohortRetention, membershipTrend } from "@/lib/reports/metrics/series";
import { periodBuckets } from "@/lib/reports/period";
import { expiryCalendar, lapsedNotBack, renewalWorklist, WORKLIST_DAYS } from "@/lib/reports/renewals";
import { drillFilters, openReport, reportShell } from "@/lib/reports/shell";
import { loadReportRows } from "@/lib/reports/source";
import type { ReportSearch } from "@/lib/reports/context";

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

/**
 * B3 renewal worklist (with the bulk reminder), B4 renewal rate and churn, the win-back list, the
 * expiry calendar and join-month cohort retention.
 */
export async function loadOrgReportsRenewals({ params, searchParams }: Props) {
  const search = await searchParams;
  const ctx = await openReport(params, Promise.resolve(search), "reports.membership");
  const { now, period, scope, org } = ctx;
  const data = prepareDataset(await loadReportRows(scope));
  const days = (WORKLIST_DAYS as readonly number[]).includes(Number(search.days)) ? Number(search.days) : 30;
  const summary = membershipSummary(data, period, now);
  const trend = membershipTrend(data, periodBuckets(period, org.timezone, "month"), now);
  const worklist = await renewalWorklist(data, scope, days, ctx.showContact, org.timezone, now);
  const lapsed = lapsedNotBack(data, period, now, org.timezone);
  const planName = new Map(ctx.plans.map((plan) => [plan.id, plan.name]));
  const filters = drillFilters(ctx);
  return {
    shell: reportShell(ctx, "renewals"),
    timeZone: ctx.org.timezone,
    summary,
    trend: trend.map((point) => ({ label: point.label, due: point.due, renewed: point.renewed, decided: point.decided, renewalRate: point.renewalRate })),
    worklist: { days, rows: worklist.slice(0, 200), total: worklist.length },
    canRemind: ctx.can("members.manage"),
    lapsed: {
      total: lapsed.length,
      rows: lapsed.slice(0, 50).map((row) => ({ ...row, name: data.memberById.get(row.memberId)?.name ?? "Member", memberNumber: data.memberById.get(row.memberId)?.memberNumber ?? 0, plan: planName.get(row.planId) ?? "Plan" })),
    },
    calendar: expiryCalendar(data, now, org.timezone),
    cohorts: cohortRetention(data, org.timezone, now, 12, 12),
    fyCohorts: fyCohortRetention(data, org, now, 5),
    links: {
      due: drillHref(org.slug, "due", filters),
      renewed: drillHref(org.slug, "renewed", filters),
      open: drillHref(org.slug, "open", filters),
      lapsed: drillHref(org.slug, "lapsed", filters),
      churned: drillHref(org.slug, "churned", filters),
      active: drillHref(org.slug, "active", filters),
    },
  };
}

export type OrgReportsRenewals = Awaited<ReturnType<typeof loadOrgReportsRenewals>>;
