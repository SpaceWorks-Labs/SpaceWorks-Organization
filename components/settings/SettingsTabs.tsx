import { loadSettingsTabsView } from "@/lib/views/app__dashboard__orgSlug__settings__tabs";
import { SettingsTabsNav } from "@/components/settings/SettingsTabsNav";

/** Settings tabs for the signed-in staff member: owner-only sections appear only for whoever may open them. */
export async function SettingsTabs({ slug }: { slug: string }) {
  const { ownerTabs } = await loadSettingsTabsView(slug);
  return <SettingsTabsNav slug={slug} ownerTabs={ownerTabs} />;
}
