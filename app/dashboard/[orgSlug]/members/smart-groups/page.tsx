import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { loadSmartGroupsView } from "@/lib/views/app__dashboard__orgSlug__members__smart-groups__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SmartGroupsPanel } from "@/components/members/smart-groups/SmartGroupsPanel";

export const metadata: Metadata = { title: "Smart groups", robots: { index: false, follow: false } };

export default async function SmartGroupsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, groups, options, canManage } = await loadSmartGroupsView({ params });
  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      <Link href={`/dashboard/${org.slug}/members`} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Members
      </Link>
      <OrgPageHeader organisation={org} title="Smart groups" description="Saved conditions over your members: plan, status, unit, grouping, answers, dates and age. Use one as a filter on the members list, in exports and in reports." />
      <SmartGroupsPanel slug={org.slug} groups={groups} options={options} canManage={canManage} />
    </div>
  );
}
