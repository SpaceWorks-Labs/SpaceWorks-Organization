import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { loadNewPlanView } from "@/lib/views/app__dashboard__orgSlug__plans__planId__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { PlanForm } from "@/components/plans/PlanForm";
import { emptyPlan } from "@/components/plans/planFormState";

export const metadata: Metadata = { title: "New plan", robots: { index: false, follow: false } };

export default async function NewPlanPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { org, units, otherPlans, groups, canManage } = await loadNewPlanView({ params });
  return (
    <div className="flex max-w-[920px] flex-col gap-6">
      <Link href={`/dashboard/${org.slug}/plans`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Membership plans
      </Link>
      <OrgPageHeader organisation={org} title="New plan" description="Set the price, how long it lasts and how people join. You can add join-form questions next." />
      <PlanForm slug={org.slug} initial={emptyPlan(org.currency)} units={units} otherPlans={otherPlans} groups={groups} disabled={!canManage} />
    </div>
  );
}
