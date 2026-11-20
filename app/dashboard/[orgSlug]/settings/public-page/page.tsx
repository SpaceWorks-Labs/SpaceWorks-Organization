import type { Metadata } from "next";
import { loadPublicPageEditorView } from "@/lib/views/app__dashboard__orgSlug__settings__public-page__page";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { PageEditor } from "@/components/settings/public-page/PageEditor";

export const metadata: Metadata = { title: "Public page", robots: { index: false, follow: false } };

export default async function OrgPublicPageSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const view = await loadPublicPageEditorView({ params });
  const { org } = view;
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader organisation={org} title="Settings" description="Your public page: what people see before they join." />
      <SettingsTabs slug={org.slug} />
      <PageEditor
        key={view.revision}
        org={org}
        initial={view.document}
        publishedLabel={view.publishedAt ? formatCalendarDate(localDate(view.publishedAt, org.timezone)) : null}
        hasDraft={view.hasDraft}
        canEdit={view.canEdit}
        plans={view.plans}
        units={view.units}
        counts={view.counts}
        sampleCard={view.sampleCard}
      />
    </div>
  );
}
