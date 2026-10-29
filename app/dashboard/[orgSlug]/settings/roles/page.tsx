import type { Metadata } from "next";
import { loadOrgStaffRolesView } from "@/lib/views/app__dashboard__orgSlug__settings__roles__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { StaffRolesEditor } from "@/components/settings/roles/StaffRolesEditor";
import { Callout, Card, CardHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Staff roles", robots: { index: false, follow: false } };

export default async function OrgStaffRolesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, canEdit, allowed, roles } = await loadOrgStaffRolesView({ params });
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader organisation={org} title="Settings" description="Staff roles decide what each person on the team can see and change." />
      <SettingsTabs slug={org.slug} />
      {!canEdit ? <Callout tone="info">You manage one unit, so staff roles are read-only for you.</Callout> : null}
      <Card as="section" className="rounded-xl">
        <CardHeader
          title="Staff roles"
          description="Give each role only what the job needs. Where someone holds it, the whole organisation or one unit, is chosen on the Team page."
        />
        <StaffRolesEditor slug={org.slug} roles={roles} allowed={allowed} canEdit={canEdit} />
      </Card>
    </div>
  );
}
