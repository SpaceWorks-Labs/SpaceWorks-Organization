import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminGrowthView } from "@/lib/views/app__super-admin__analytics__growth";
import { AnalyticsShell, RangePicker, rangeParam } from "@/components/super-admin/analytics/AnalyticsShell";
import { GrowthCharts } from "@/components/super-admin/analytics/GrowthCharts";
import { GrowthTiles } from "@/components/super-admin/analytics/GrowthTiles";
import { withQuery } from "@/components/super-admin/analytics/format";

export const metadata: Metadata = { title: "Growth · Analytics", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ range?: string }> };

export default async function SuperAdminGrowthPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const view = await loadSuperAdminGrowthView({ searchParams });
  return (
    <AnalyticsShell
      tab="growth"
      range={view.range}
      filters={<RangePicker ranges={view.ranges} current={view.range} hrefFor={(range) => withQuery("/super-admin/analytics/growth", { range: rangeParam(range) })} />}
      note="Ranges run in UTC. Each figure is set against the period of the same length just before."
    >
      <GrowthTiles view={view} />
      <GrowthCharts view={view} />
    </AnalyticsShell>
  );
}
