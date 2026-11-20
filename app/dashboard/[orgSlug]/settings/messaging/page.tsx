import type { Metadata } from "next";
import { loadOrgMessagingView } from "@/lib/views/app__dashboard__orgSlug__settings__messaging__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { ChannelCard } from "@/components/messaging/ChannelCard";
import { RoutingForm } from "@/components/messaging/RoutingForm";
import { WhatsAppTemplates } from "@/components/messaging/WhatsAppTemplates";
import { Callout } from "@/components/ui/display";
import { CONFIGURABLE_CHANNELS } from "@/lib/messages/kinds";

export const metadata: Metadata = { title: "Messaging", robots: { index: false, follow: false } };

export default async function OrgMessagingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, canEdit, canConnect, secretsReady, platformOk, sources, channels, templates, routing, quietStart, quietEnd } = await loadOrgMessagingView({ params });
  const available = CONFIGURABLE_CHANNELS.filter((channel) => sources[channel] !== null);
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader organisation={org} title="Settings" description="How reminders and notices reach your members, beyond email." />
      <SettingsTabs slug={org.slug} />
      {!canConnect ? <Callout tone="info">Only the Owner can change connections, because they hold secrets. You can still change routing and quiet hours.</Callout> : null}
      {channels.map((view) => (
        <ChannelCard
          key={view.channel}
          slug={org.slug}
          view={view}
          canEdit={canConnect}
          secretsReady={secretsReady}
          note={sources[view.channel] === "platform" ? "Members are reached through the platform's own connection." : sources[view.channel] === "org" ? "Members are reached through this connection." : platformOk ? "The platform has none to share either." : "The platform's channels are not shared with organisations."}
        />
      ))}
      <WhatsAppTemplates slug={org.slug} rows={templates} canEdit={canEdit} />
      <RoutingForm slug={org.slug} routing={routing} available={available} quietStart={quietStart} quietEnd={quietEnd} timezone={org.timezone} canEdit={canEdit} />
    </div>
  );
}
