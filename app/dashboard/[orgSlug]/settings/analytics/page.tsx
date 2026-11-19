import type { Metadata } from "next";
import { loadOrgWebAnalyticsSettingsView } from "@/lib/views/app__dashboard__orgSlug__settings__analytics__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { OrgWebTelemetryForm } from "@/components/telemetry/OrgWebTelemetryForm";
import { Callout, Card, CardHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Web analytics", robots: { index: false, follow: false } };

export default async function OrgWebAnalyticsSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, initial, allowedOrigins } = await loadOrgWebAnalyticsSettingsView({ params });
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader organisation={org} title="Settings" description="Outside analytics for your public pages." />
      <SettingsTabs slug={org.slug} />
      <Card as="section" className="max-w-[860px] rounded-xl">
        <CardHeader
          title="Web analytics"
          description={`These providers run only on ${org.name}'s public pages and join forms, only for visitors who are signed out and agree. The platform's own choices do not apply there. Visit counts for those pages are always kept in Space Works itself, without cookies or personal data (see Reports, Web visits).`}
        />
        <div className="flex flex-col gap-4">
          <Callout tone="info">Only the owner can change this.</Callout>
          <OrgWebTelemetryForm slug={org.slug} initial={initial} allowedOrigins={allowedOrigins} />
        </div>
      </Card>
    </div>
  );
}
