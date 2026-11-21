import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminWebAnalyticsView } from "@/lib/views/app__super-admin__analytics__web";
import { AnalyticsShell } from "@/components/super-admin/analytics/AnalyticsShell";
import { WebAnalytics } from "@/components/super-admin/analytics/WebAnalytics";

export const metadata: Metadata = { title: "Web · Analytics", robots: { index: false, follow: false } };

export default async function SuperAdminWebAnalyticsPage() {
  await requireSuperAdmin();
  const web = await loadSuperAdminWebAnalyticsView();
  return (
    <AnalyticsShell tab="web">
      <WebAnalytics view={web} />
    </AnalyticsShell>
  );
}
