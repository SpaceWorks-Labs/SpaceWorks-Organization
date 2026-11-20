import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadPlatformMessagingView } from "@/lib/views/app__super-admin__messaging__page";
import { ChannelCard } from "@/components/messaging/ChannelCard";
import { WhatsAppTemplates } from "@/components/messaging/WhatsAppTemplates";
import { PolicySwitch } from "@/components/messaging/PolicySwitch";
import { StatusPill } from "@/components/super-admin/StatusPill";
import { Card, CardHeader, PageHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Messaging" };

export default async function SuperAdminMessagingPage() {
  await requireSuperAdmin();
  const { allowOrganisations, secretsReady, channels, templates, sms } = await loadPlatformMessagingView();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Messaging" description="The platform's own channels for reminders and notices to members. An organisation's own connection always comes first." />
      <Card as="section" className="max-w-[860px] rounded-xl">
        <CardHeader title="Organisations may use these channels" description="Switched off, only organisations with their own connection can send beyond email." />
        <PolicySwitch allowed={allowOrganisations} />
      </Card>
      <Card as="section" className="max-w-[860px] rounded-xl">
        <CardHeader title="Text messages" description="Set up with sign-in under Auth, because it also carries phone codes." action={<StatusPill state={!sms.ready ? "not_set_up" : sms.failed ? "unavailable" : "available"} />} />
        <Link href="/super-admin/auth" className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline underline-offset-4">Text message settings</Link>
      </Card>
      {channels.map((view) => <ChannelCard key={view.channel} view={view} canEdit secretsReady={secretsReady} />)}
      <WhatsAppTemplates rows={templates} canEdit />
    </div>
  );
}
