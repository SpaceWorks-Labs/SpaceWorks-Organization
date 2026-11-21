import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminMoneyView } from "@/lib/views/app__super-admin__analytics__growth";
import { AnalyticsShell, RangePicker, rangeParam } from "@/components/super-admin/analytics/AnalyticsShell";
import { MoneySections } from "@/components/super-admin/analytics/MoneySections";
import { withQuery } from "@/components/super-admin/analytics/format";

export const metadata: Metadata = { title: "Money · Analytics", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ range?: string }> };

export default async function SuperAdminMoneyPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const view = await loadSuperAdminMoneyView({ searchParams });
  return (
    <AnalyticsShell
      tab="money"
      range={view.range}
      filters={<RangePicker ranges={view.ranges} current={view.range} hrefFor={(range) => withQuery("/super-admin/analytics/money", { range: rangeParam(range) })} />}
      note="Each currency stands on its own: amounts are never added together or converted. Ranges run in UTC."
    >
      <MoneySections view={view} />
    </AnalyticsShell>
  );
}
