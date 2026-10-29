import type { Metadata } from "next";
import { loadOrgReportsUnits } from "@/lib/views/app__dashboard__orgSlug__reports__units__page";
import type { ReportSearch } from "@/lib/reports/context";
import { ReportShell } from "@/components/reports/ReportShell";
import { UnitLevels } from "@/components/reports/UnitLevels";

export const metadata: Metadata = { title: "Unit reports", robots: { index: false, follow: false } };

type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<ReportSearch> };

export default async function OrgReportsUnitsPage({ params, searchParams }: Props) {
  const view = await loadOrgReportsUnits({ params, searchParams });
  return (
    <ReportShell shell={view.shell} title="Units">
      <UnitLevels view={view} />
    </ReportShell>
  );
}
