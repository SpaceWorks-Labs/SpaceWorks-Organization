import type { Metadata } from "next";
import { loadOrgVisitsReport } from "@/lib/views/app__dashboard__orgSlug__reports__visits__page";
import { Download } from "lucide-react";
import { ReportShell } from "@/components/reports/ReportShell";
import { buttonClasses } from "@/components/ui/button";
import { VisitsCharts } from "@/components/reports/visits/VisitsCharts";
import { VisitsPeriodLinks } from "@/components/reports/visits/VisitsPeriodLinks";

export const metadata: Metadata = { title: "Web visits", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ period?: string; from?: string; to?: string }> };

export default async function OrgVisitsReportPage({ params, searchParams }: Props) {
  const view = await loadOrgVisitsReport({ params, searchParams });
  return (
    <ReportShell
      shell={view.shell}
      title="Web visits"
      description={`${view.periodLabel} · views of your public pages, counted by Space Works without cookies or personal details`}
      hideFilters
      actions={
        <a href={`/api/visits/export/${view.shell.org.slug}${view.exportQuery}`} className={buttonClasses({ variant: "secondary", size: "sm", className: "sw-print-hide" })} download>
          <Download aria-hidden className="size-4" />
          Export CSV
        </a>
      }
    >
      <VisitsPeriodLinks slug={view.shell.org.slug} active={view.period} />
      <VisitsCharts summary={view.summary} />
    </ReportShell>
  );
}
