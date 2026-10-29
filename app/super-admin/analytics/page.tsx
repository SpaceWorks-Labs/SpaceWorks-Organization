import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminAnalyticsView } from "@/lib/views/app__super-admin__analytics__page";
import { ComparisonTable } from "@/components/super-admin/analytics/ComparisonTable";
import { PlatformTrends } from "@/components/super-admin/analytics/PlatformTrends";
import { KpiTile } from "@/components/reports/charts/Figures";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Analytics", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ sort?: string; dir?: string }> };

export default async function SuperAdminAnalyticsPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const view = await loadSuperAdminAnalyticsView({ searchParams });
  const latest = view.trends.members.at(-1);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="Every organisation compared, and how the platform is trending. Totals only, never a member's name or contact details."
        actions={
          <a href={`/api/exports/platform/analytics?sort=${view.sort.key}&dir=${view.sort.dir}`} className={buttonClasses({ variant: "secondary", size: "sm" })} download>
            <Download aria-hidden className="size-4" />
            Export CSV
          </a>
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <KpiTile label="Organisations" value={view.rows.length} hint="Active or suspended" />
        <KpiTile label="Active members, all organisations" value={latest?.active ?? 0} trend={view.trends.members.map((p) => p.active)} hint={`${latest?.grace ?? 0} in grace`} />
        <KpiTile label="Dormant organisations" value={view.dormant} hint="No staff sign-in or payment for 60 days" />
      </div>
      <section aria-labelledby="compare" className="flex flex-col gap-3">
        <h2 id="compare" className="text-title text-ink">Organisations compared</h2>
        <p className="text-label text-ink-muted">
          Active members and growth come from the daily rollup. Renewal rate is renewals against lapses over 12 months. Revenue is net of refunds over 12 months, and outstanding is owed now, each per currency.
        </p>
        {view.rows.length ? <ComparisonTable view={view} /> : <p className="text-label text-ink-muted">No active organisations yet.</p>}
      </section>
      <PlatformTrends trends={view.trends} />
    </div>
  );
}
