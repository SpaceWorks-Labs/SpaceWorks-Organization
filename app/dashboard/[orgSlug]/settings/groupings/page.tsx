import type { Metadata } from "next";
import { loadOrgGroupingsView } from "@/lib/views/app__dashboard__orgSlug__settings__groupings__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { GroupingsEditor } from "@/components/settings/groupings/GroupingsEditor";

export const metadata: Metadata = { title: "Groupings", robots: { index: false, follow: false } };

export default async function OrgGroupingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, groupings, canEdit } = await loadOrgGroupingsView({ params });
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader organisation={org} title="Settings" description="Groupings divide members in ways beyond units: a profession, a region, an interest. Members choose values on the join form, and staff can be limited to some." />
      <SettingsTabs slug={org.slug} />
      <GroupingsEditor slug={org.slug} groupings={groupings} disabled={!canEdit} />
    </div>
  );
}
