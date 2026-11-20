import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { loadAddMembersView } from "@/lib/views/app__dashboard__orgSlug__members__new__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { ImportWizard } from "@/components/members/ImportWizard";

export const metadata: Metadata = { title: "Import members", robots: { index: false, follow: false } };

export default async function ImportMembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, plans, fields, groupings } = await loadAddMembersView({ params });
  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      <Link href={`/dashboard/${org.slug}/members`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Members
      </Link>
      <OrgPageHeader organisation={org} title="Import members" description="Bring your existing register from a Google Sheet or a CSV file. Nothing is saved until you choose Import." />
      <ImportWizard slug={org.slug} plans={plans} fields={fields.map(({ key, label }) => ({ key, label }))} groupings={groupings.map(({ key, name }) => ({ key, name }))} />
    </div>
  );
}
