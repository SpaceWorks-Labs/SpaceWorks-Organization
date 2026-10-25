import type { Metadata } from "next";
import { loadOrgCardSettingsView } from "@/lib/views/app__dashboard__orgSlug__settings__cards__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { CardDesigner } from "@/components/cards/designer/CardDesigner";
import { CardExportsList } from "@/components/cards/CardExportsList";
import { DesignScopePicker } from "@/components/cards/DesignScopePicker";
import { Callout, Card, CardHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Cards", robots: { index: false, follow: false } };

export default async function OrgCardSettingsPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ plan?: string; role?: string }> }) {
  const view = await loadOrgCardSettingsView({ params, searchParams });
  const { org } = view;
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader
        organisation={org}
        title="Settings"
        description={`Member cards: ${view.cardCount.toLocaleString("en-IN")} valid ${view.cardCount === 1 ? "card" : "cards"}. Every card carries a QR code that shows the membership as it is right now.`}
      />
      <SettingsTabs slug={org.slug} />
      {!view.canEdit ? <Callout tone="info">You manage one unit, so card designs are read-only for you.</Callout> : null}
      <DesignScopePicker slug={org.slug} plans={view.plans} roles={view.roles} planId={view.plan?.id ?? null} roleId={view.role?.id ?? null} source={view.source} disabled={!view.canEdit} />
      {view.canEdit ? (
        <CardDesigner
          key={`${view.plan?.id ?? view.role?.id ?? "organisation"}-${view.source}`}
          organisationSlug={org.slug}
          organisationName={org.name}
          planId={view.plan?.id ?? null}
          planName={view.plan?.name ?? ""}
          roleId={view.role?.id ?? null}
          roleName={view.role?.name ?? ""}
          initialDesign={view.design}
          branding={view.branding}
          fields={view.fields}
          numbering={view.numbering}
        />
      ) : null}
      {view.canExport ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="Your card downloads" description="Bulk downloads you started from the Members page. Files are kept for seven days." />
          <CardExportsList rows={view.exports} />
        </Card>
      ) : null}
    </div>
  );
}
