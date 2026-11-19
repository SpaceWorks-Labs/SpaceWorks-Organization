import Link from "next/link";
import type { Metadata } from "next";
import { loadAccountsView } from "@/lib/views/app__dashboard__orgSlug__accounts__page";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { LedgerPanel } from "@/components/accounts/LedgerPanel";
import { OpeningBalanceForm } from "@/components/accounts/OpeningBalanceForm";
import { StatementView } from "@/components/accounts/StatementView";
import { PrintButton } from "@/components/reports/PrintButton";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Accounts", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ fy?: string }> };

export default async function AccountsPage({ params, searchParams }: Props) {
  const view = await loadAccountsView({ params, searchParams });
  const { org } = view;
  const today = localDate(new Date(), org.timezone);
  const todayKey = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader organisation={org} title="Accounts" description="The receipts and payments account for each financial year, from membership payments and everything else you record." actions={view.scoped ? null : <PrintButton />} />
      {view.scoped ? (
        <Callout tone="info" title="Kept for the whole organisation">The accounts cover every unit, so they&apos;re open to owners, managers and treasurers without a unit limit.</Callout>
      ) : (
        <>
          <nav aria-label="Financial year" className="sw-print-hide flex flex-wrap gap-2">
            {view.years.map((year) => (
              <Link key={year} href={`/dashboard/${org.slug}/accounts?fy=${year}`} aria-current={year === view.year ? "page" : undefined} className={cn("inline-flex min-h-11 items-center rounded-control border px-3.5 text-sm", year === view.year ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted")}>
                FY {year}
              </Link>
            ))}
          </nav>
          <Card as="section" className="rounded-xl">
            <CardHeader title={`Receipts and payments account, FY ${view.year}`} description="Cash basis: what actually came in and went out. Check it with your accountant before filing." />
            <div className="flex flex-col gap-6">
              {view.statements.length === 0 ? <p className="text-body-ui text-ink-muted">No money in or out this year yet.</p> : view.statements.map((statement) => <StatementView key={statement.currency} statement={statement} yearLabel={view.year} locale={org.locale} />)}
            </div>
          </Card>
          <div className="sw-print-hide flex flex-col gap-6">
            <LedgerPanel
              slug={org.slug}
              canManage={view.canManage}
              currencies={view.currencies}
              today={todayKey}
              locale={org.locale}
              rows={view.entries.map((entry) => ({
                id: entry.id,
                direction: entry.direction,
                date: formatCalendarDate({ year: entry.occurredOn.getUTCFullYear(), month: entry.occurredOn.getUTCMonth() + 1, day: entry.occurredOn.getUTCDate() }),
                category: entry.category,
                party: entry.party,
                description: entry.description,
                currency: entry.currency,
                amountMinor: entry.amountMinor,
                method: entry.method,
                reference: entry.reference,
                voided: entry.voidReason ? { reason: entry.voidReason } : null,
              }))}
            />
            {view.canManage ? <OpeningBalanceForm key={view.year} slug={org.slug} year={view.year} currencies={view.currencies} openings={view.openings} /> : null}
          </div>
        </>
      )}
    </div>
  );
}
