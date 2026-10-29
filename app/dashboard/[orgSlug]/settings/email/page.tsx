import type { Metadata } from "next";
import { loadOrgEmailSettingsView } from "@/lib/views/app__dashboard__orgSlug__settings__email__page";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { OrgEmailForm } from "@/components/settings/OrgEmailForm";
import { EmailTemplateEditor } from "@/components/settings/EmailTemplateEditor";
import { EMAIL_TEMPLATE_KINDS } from "@/lib/email/templates";
import { Card, CardHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Email", robots: { index: false, follow: false } };

export default async function OrgEmailSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, canEdit, platformSender, settings, templates } = await loadOrgEmailSettingsView({ params });
  const { verifiedAt, ...initial } = settings;
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader organisation={org} title="Settings" description="How emails to your members are sent." />
      <SettingsTabs slug={org.slug} />
      <Card as="section" className="max-w-[860px] rounded-xl">
        <CardHeader
          title="Your own email"
          description={`Member emails (notices, receipts, renewal reminders, invites, cards and refund replies) can go out from your own address. Without it they come from ${platformSender} in ${org.name}'s name${org.contactEmail ? `, with replies to ${org.contactEmail}` : ""}. Sign-in emails such as password resets always come from the platform.`}
        />
        <OrgEmailForm slug={org.slug} canEdit={canEdit} initial={initial} verified={verifiedAt ? formatCalendarDate(localDate(verifiedAt, "UTC")) : null} />
      </Card>
      <Card as="section" className="max-w-[1100px] rounded-xl">
        <CardHeader
          title="Wording of member emails"
          description="Write these emails in your own words. Placeholders in curly brackets are filled in for each member; anything else you type is sent as plain text. Without your own wording the standard wording is used."
        />
        <div className="flex flex-col gap-6">
          {EMAIL_TEMPLATE_KINDS.map((kind) => <EmailTemplateEditor key={kind} slug={org.slug} kind={kind} organisation={org.name} saved={templates[kind]} canEdit={canEdit} />)}
        </div>
      </Card>
    </div>
  );
}
