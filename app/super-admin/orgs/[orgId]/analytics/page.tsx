import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminOrgAnalyticsView } from "@/lib/views/app__super-admin__orgs__orgId__analytics__page";
import { OrgAnalytics } from "@/components/super-admin/analytics/OrgAnalytics";
import { OrganisationStatusChip } from "@/components/org/OrganisationStatusChip";
import { PageHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Organisation analytics", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgId: string }> };

export default async function SuperAdminOrgAnalyticsPage({ params }: Props) {
  await requireSuperAdmin();
  const view = await loadSuperAdminOrgAnalyticsView({ params });
  return (
    <div className="flex flex-col gap-6">
      <Link href={`/super-admin/orgs/${view.org.id}`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        {view.org.name}
      </Link>
      <PageHeader
        title="Analytics"
        description="Totals for the last 12 months. No member names or contact details are shown here, and this view is recorded in the audit log."
        actions={<OrganisationStatusChip status={view.org.status} />}
      />
      <OrgAnalytics view={view} />
    </div>
  );
}
