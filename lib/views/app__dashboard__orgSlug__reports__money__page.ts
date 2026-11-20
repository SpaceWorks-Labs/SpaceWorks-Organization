import { prisma } from "@/lib/db";
import { prepareDataset } from "@/lib/reports/dataset";
import { membershipSummary } from "@/lib/reports/metrics/flows";
import { termActiveAt } from "@/lib/reports/metrics/standing";
import { periodBuckets } from "@/lib/reports/period";
import { currenciesOf, amountIn } from "@/lib/reports/money";
import { openReport, reportShell } from "@/lib/reports/shell";
import { loadReportRows, scopedTermWhere } from "@/lib/reports/source";
import { loadFinancePlans, loadFinanceRows, loadTermPeriods } from "@/lib/reports/finance/source";
import { subscriptionIncome } from "@/lib/reports/finance/subscriptionIncome";
import { addMonths, financialYearLabel, financialYearStart, localDate, startOfLocalDay } from "@/lib/membership/periods";
import { paymentHealth, revenueBy, revenueByFeeKind, revenueSeries, revenueSummary } from "@/lib/reports/finance/revenue";
import { ageingTable, collectionRate, offlineQueue, outstandingItems } from "@/lib/reports/finance/outstanding";
import { forecastVsActual, renewalForecast } from "@/lib/reports/finance/forecast";
import type { ReportSearch } from "@/lib/reports/context";

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

const PROVIDER_LABELS: Record<string, string> = { RAZORPAY: "Razorpay", STRIPE: "Stripe", OFFLINE: "Offline", none: "Not recorded" };
const FEE_LABELS: Record<string, string> = { TERM_FEE: "Membership fee", JOINING_FEE: "Joining fee", REJOIN_FEE: "Rejoining fee" };

/**
 * B5 revenue (collected by paidAt, net of refunds by refund date), the renewal forecast, B9 outstanding
 * with ageing, B8 the offline confirmation queue, refunds, waivers and failed payments. Every money figure
 * stays in its own currency, the organisation's first.
 */
export async function loadOrgReportsMoney({ params, searchParams }: Props) {
  const ctx = await openReport(params, searchParams, "reports.finance");
  const { now, period, scope, org } = ctx;
  const primary = org.currency;
  const [rows, plans, data] = await Promise.all([loadFinanceRows(scope), loadFinancePlans(org.id), loadReportRows(scope).then(prepareDataset)]);
  const buckets = periodBuckets(period, org.timezone, "month");
  const planName = new Map(ctx.plans.map((plan) => [plan.id, plan.name]));
  const unitName = new Map(ctx.allUnits.map((unit) => [unit.id, unit.name]));
  const series = revenueSeries(rows, buckets, primary);
  const currencies = currenciesOf([...rows.payments, ...rows.unpaidTerms, ...plans.filter((plan) => plan.priceRenewalMinor > 0)], primary).slice(0, 3);
  const dueBy = new Map((await prisma.membershipTerm.findMany({ where: { ...scopedTermWhere(scope), id: { in: rows.payments.flatMap((payment) => (payment.termId ? [payment.termId] : [])) } }, select: { id: true, paymentDueBy: true } })).map((term) => [term.id, term.paymentDueBy]));
  const outstanding = outstandingItems(rows, now, dueBy);
  const trailing = membershipSummary(data, { from: new Date(now.getTime() - 365 * 86_400_000), to: now }, now).renewalRate;
  const forecastTerms = data.terms.map((term) => ({ id: term.id, planId: term.planId, memberId: term.memberId, endsAt: term.endsAt, renewed: term.renewed, active: termActiveAt(term, now), renewedFromId: term.renewedFromId }));
  const named = (list: ReturnType<typeof revenueBy>, labels: (key: string) => string) => list.slice(0, 12).map((row) => ({ ...row, label: labels(row.key) }));
  const offline = offlineQueue(rows, period, primary);
  // The financial year the period ends in, for the subscription income schedule.
  const fyFirst = financialYearStart(localDate(new Date(period.to.getTime() - 1), org.timezone), org.financialYearStartMonth);
  const fy = { from: startOfLocalDay(fyFirst, org.timezone), to: startOfLocalDay(addMonths(fyFirst, 12), org.timezone) };
  const termPeriods = await loadTermPeriods(scope, [...new Set(rows.payments.flatMap((payment) => (payment.termId ? [payment.termId] : [])))]);

  return {
    shell: reportShell(ctx, "money"),
    timeZone: ctx.org.timezone,
    primary,
    locale: org.locale,
    currencies,
    summary: revenueSummary(rows, period, primary),
    series: currencies.map((currency) => ({ currency, points: series.map((point) => ({ label: point.label, gross: amountIn(point.gross, currency), refunds: amountIn(point.refunds, currency), net: amountIn(point.net, currency) })) })),
    byPlan: named(revenueBy(rows, period, "plan", primary), (key) => planName.get(key) ?? "No plan"),
    byUnit: ctx.allUnits.length ? named(revenueBy(rows, period, "unit", primary), (key) => unitName.get(key) ?? "No unit") : [],
    byProvider: named(revenueBy(rows, period, "provider", primary), (key) => PROVIDER_LABELS[key] ?? key),
    byMethod: named(revenueBy(rows, period, "method", primary), (key) => (key === "none" ? "Not recorded" : key.replace(/_/g, " "))),
    byFee: named(revenueByFeeKind(rows, period, primary), (key) => FEE_LABELS[key] ?? key),
    health: (({ refunds, ...rest }) => ({ ...rest, refunds: refunds.slice(0, 50) }))(paymentHealth(rows, period, primary)),
    collection: collectionRate(rows, period, primary),
    ageing: ageingTable(outstanding, primary),
    outstanding: outstanding.slice(0, 100).map((item) => ({ ...item, name: data.memberById.get(item.memberId)?.name ?? "Member", memberNumber: data.memberById.get(item.memberId)?.memberNumber ?? 0, plan: item.planId ? planName.get(item.planId) ?? "Plan" : "—" })),
    outstandingTotal: outstanding.length,
    offline: { ...offline, awaiting: offline.awaiting.slice(0, 50).map((payment) => ({ ...payment, name: data.memberById.get(payment.memberId)?.name ?? "Member" })), flagged: offline.flagged.slice(0, 50).map((payment) => ({ ...payment, name: data.memberById.get(payment.memberId)?.name ?? "Member" })) },
    forecast: renewalForecast(forecastTerms, plans, now, trailing, primary),
    trailingRenewalRate: trailing,
    subscriptionIncome: { yearLabel: `FY ${financialYearLabel(fyFirst, org.financialYearStartMonth)}`, rows: subscriptionIncome(rows, termPeriods, fy, primary) },
    forecastVsActual: forecastVsActual(forecastTerms, plans, rows, buckets, primary).filter((_, index) => buckets[index].from <= now),
  };
}

export type OrgReportsMoney = Awaited<ReturnType<typeof loadOrgReportsMoney>>;
