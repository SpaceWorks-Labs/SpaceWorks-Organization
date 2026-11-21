import type { Metadata } from "next";
import { loadPublicPageEditorView } from "@/lib/views/app__dashboard__orgSlug__settings__public-page__page";
import { formatCalendarDate, localDate } from "@/lib/membership/periods";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { VisualEditor } from "@/components/settings/public-page/editor/VisualEditor";

export const metadata: Metadata = { title: "Public page", robots: { index: false, follow: false } };

export default async function OrgPublicPageSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const view = await loadPublicPageEditorView({ params });
  const { org } = view;
  // No `key` from the revision: the editor keeps its own document, undo history and selection across autosaves,
  // publishing and restores, and reads `published` and `publishedLabel` as they change.
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader organisation={org} title="Settings" description="Your public page: what people see before they join. Edit it on the page itself." />
      <SettingsTabs slug={org.slug} />
      <VisualEditor
        org={org}
        initial={view.document}
        published={view.published}
        publishedLabel={view.publishedAt ? formatCalendarDate(localDate(view.publishedAt, org.timezone)) : null}
        hasDraft={view.hasDraft}
        canEdit={view.canEdit}
        plans={view.plans}
        units={view.units}
        counts={view.counts}
        sampleCard={view.sampleCard}
        extras={{ areas: view.areas, groupings: view.groupings, statsCatalogue: view.statsCatalogue, unitLevels: org.unitLevels, pageImages: view.pageImages }}
      />
    </div>
  );
}
