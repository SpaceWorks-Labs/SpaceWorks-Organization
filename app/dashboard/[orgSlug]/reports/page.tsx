import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, FileDown } from "lucide-react";
import { loadOrgReportsOverview } from "@/lib/views/app__dashboard__orgSlug__reports__page";
import type { ReportSearch } from "@/lib/reports/context";
import { ReportShell } from "@/components/reports/ReportShell";
import { MembershipBridge, OverviewKpis, OverviewNow, OverviewTrends } from "@/components/reports/OverviewSections";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";

export const metadata: Metadata = { title: "Reports", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

export default async function OrgReportsOverviewPage({ params, searchParams }: Props) {
  const view = await loadOrgReportsOverview({ params, searchParams });
  const empty = view.summary.activeStart + view.summary.activeEnd + view.summary.joined + view.standing.pendingApproval + view.standing.pendingPayment === 0;
  return (
    <ReportShell
      shell={view.shell}
      title="Reports"
      actions={
        <>
          <Link href={`/dashboard/${view.shell.org.slug}/reports/visits`} className={buttonClasses({ variant: "secondary", className: "sw-print-hide" })}>
            <BarChart3 aria-hidden className="size-4" />
            Web visits
          </Link>
          <a href={`/dashboard/${view.shell.org.slug}/reports/print${view.shell.query ? `${view.shell.query}&` : "?"}print=1`} className={buttonClasses({ variant: "secondary", className: "sw-print-hide" })}>
            <FileDown aria-hidden className="size-4" />
            PDF snapshot
          </a>
        </>
      }
    >
      {empty ? (
        <EmptyState mood="sleepy" title="No members in this view yet">
          Numbers appear here once people join. Try a longer period, or another plan or unit.
        </EmptyState>
      ) : (
        <>
          <MembershipBridge view={view} />
          <OverviewKpis view={view} />
          <OverviewTrends view={view} />
          <OverviewNow view={view} />
        </>
      )}
    </ReportShell>
  );
}
