import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminOperationsHealthView } from "@/lib/views/app__super-admin__analytics__health";
import { AnalyticsShell, DaysPicker } from "@/components/super-admin/analytics/AnalyticsShell";
import { OperationsEmails, OperationsMessaging } from "@/components/super-admin/analytics/OperationsDelivery";
import { OperationsOutbox, OperationsTiles } from "@/components/super-admin/analytics/OperationsOutbox";
import { OperationsSignIns, OperationsSms } from "@/components/super-admin/analytics/OperationsSecurity";
import { OperationsSystem } from "@/components/super-admin/analytics/OperationsSystem";
import { Section } from "@/components/super-admin/analytics/parts";

export const metadata: Metadata = { title: "Operations · Analytics", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ days?: string }> };

export default async function SuperAdminOperationsHealthPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const view = await loadSuperAdminOperationsHealthView({ searchParams });
  return (
    <AnalyticsShell
      tab="operations"
      days={view.days}
      filters={<DaysPicker options={view.dayRanges} current={view.days} path="/super-admin/analytics/operations" />}
      note="Counts, ages and sizes only: no address, number, message text or error text. Days run in UTC."
    >
      <Section id="ops-now" title="Delivery queue now" description="Current figures, whatever the days chosen.">
        <OperationsTiles view={view} />
      </Section>
      <OperationsOutbox view={view} />
      <OperationsEmails view={view} />
      <Section id="ops-messages" title="Messages and alerts">
        <OperationsMessaging view={view} />
      </Section>
      <OperationsSms view={view} />
      <OperationsSignIns view={view} />
      <Section id="ops-system" title="Jobs and storage">
        <OperationsSystem view={view} />
      </Section>
    </AnalyticsShell>
  );
}
