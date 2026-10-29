import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { loadAddMembersView } from "@/lib/views/app__dashboard__orgSlug__members__new__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { MemberProfileForm } from "@/components/members/MemberProfileForm";
import { Card } from "@/components/ui/display";

export const metadata: Metadata = { title: "Add member", robots: { index: false, follow: false } };

export default async function AddMemberPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, plans, units, questions, unitLabel } = await loadAddMembersView({ params });
  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      <Link href={`/dashboard/${org.slug}/members`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Members
      </Link>
      <OrgPageHeader organisation={org} title="Add a member" description="For people who joined in person or paid offline. They can sign in later with this email to see their membership." />
      <Card as="section" className="rounded-xl">
        <MemberProfileForm
          slug={org.slug}
          units={units}
          unitLabel={unitLabel}
          questions={questions}
          plans={plans}
          initial={{ name: "", email: "", phone: "", stateCode: "", unitId: "", isMinor: false, guardianName: "", guardianEmail: "", guardianPhone: "", fieldValues: {} }}
        />
      </Card>
    </div>
  );
}
