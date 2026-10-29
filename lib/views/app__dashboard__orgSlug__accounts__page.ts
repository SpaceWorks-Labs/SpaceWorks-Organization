import { prisma } from "@/lib/db";
import { can, requireOrgCapability } from "@/lib/permissions";
import { addMonths, financialYearLabel, financialYearStart, localDate, startOfLocalDay, type CalendarDate } from "@/lib/membership/periods";
import { receiptsAndPayments } from "@/lib/accounts/statement";

const dateColumn = (day: CalendarDate) => new Date(Date.UTC(day.year, day.month - 1, day.day));

/**
 * The organisation's books for one financial year: the receipts and payments account, every ledger entry
 * (voided ones shown struck through), and the opening balances. Kept for the whole organisation, so a
 * manager limited to one unit sees a notice instead.
 */
export async function loadAccountsView({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ fy?: string }> }) {
  const { orgSlug } = await params;
  const { fy } = await searchParams;
  const { organisation, membership } = await requireOrgCapability(orgSlug, "payments.view");
  const org = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisation.id },
    select: { id: true, name: true, slug: true, logoUrl: true, timezone: true, financialYearStartMonth: true, currency: true, locale: true, createdAt: true, taxSettings: { select: { mode: true, simpleTaxName: true } } },
  });
  const scoped = Boolean(membership.unitId);
  const now = new Date();
  const current = financialYearStart(localDate(now, org.timezone), org.financialYearStartMonth);
  const first = financialYearStart(localDate(org.createdAt, org.timezone), org.financialYearStartMonth);
  const years: Array<{ label: string; start: CalendarDate }> = [];
  for (let start = current; dateColumn(start) >= dateColumn(first) && years.length < 10; start = addMonths(start, -12)) years.push({ label: financialYearLabel(start, org.financialYearStartMonth), start });
  if (years.length === 0) years.push({ label: financialYearLabel(current, org.financialYearStartMonth), start: current });
  const year = years.find((entry) => entry.label === fy) ?? years[0];
  const next = addMonths(year.start, 12);
  const base = { org, scoped, years: years.map((entry) => entry.label), year: year.label, canManage: can(membership, "accounts.manage", { write: true }) };
  if (scoped) return { ...base, statements: [], entries: [], openings: [], currencies: [org.currency] };

  const window = { gte: startOfLocalDay(year.start, org.timezone), lt: startOfLocalDay(next, org.timezone) };
  const [entries, payments, refunds, openings, planCurrencies] = await Promise.all([
    prisma.ledgerEntry.findMany({ where: { organisationId: org.id, occurredOn: { gte: dateColumn(year.start), lt: dateColumn(next) } }, orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }] }),
    prisma.payment.findMany({ where: { organisationId: org.id, status: "PAID", paidAt: window }, select: { id: true, currency: true, method: true, provider: true, lines: { select: { paymentId: true, kind: true, taxableMinor: true, cgstMinor: true, sgstMinor: true, igstMinor: true, otherTaxMinor: true } } } }),
    prisma.refund.findMany({ where: { organisationId: org.id, status: "PROCESSED", processedAt: window }, select: { paymentId: true, currency: true, amountMinor: true, payment: { select: { id: true, method: true, provider: true } } } }),
    prisma.openingBalance.findMany({ where: { organisationId: org.id, financialYear: year.label } }),
    prisma.membershipPlan.findMany({ where: { organisationId: org.id }, distinct: ["currency"], select: { currency: true } }),
  ]);
  const taxName = org.taxSettings?.mode === "SIMPLE" ? org.taxSettings.simpleTaxName : org.taxSettings?.mode === "GST" ? "GST" : "Tax";
  const statements = receiptsAndPayments(
    {
      openings,
      payments,
      lines: payments.flatMap((payment) => payment.lines),
      refunds,
      refundPayments: refunds.map((refund) => refund.payment),
      entries: entries.filter((entry) => !entry.voidedAt),
      taxName,
    },
    org.currency,
  );
  const currencies = [...new Set([org.currency, ...planCurrencies.map((plan) => plan.currency), ...statements.map((statement) => statement.currency)])];
  return { ...base, statements, entries, openings, currencies };
}
