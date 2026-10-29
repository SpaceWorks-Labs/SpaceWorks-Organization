import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { loadPlanView } from "@/lib/views/app__dashboard__orgSlug__plans__planId__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { PlanForm } from "@/components/plans/PlanForm";
import { planToValues } from "@/components/plans/planFormState";
import { PlanFieldsEditor } from "@/components/plans/PlanFieldsEditor";
import { PlanInvitesPanel } from "@/components/plans/PlanInvitesPanel";
import { Card, CardHeader, Chip } from "@/components/ui/display";

export const metadata: Metadata = { title: "Plan", robots: { index: false, follow: false } };

export default async function PlanPage({ params }: { params: Promise<{ orgSlug: string; planId: string }> }) {
  const { org, plan, units, invites, canManagePlan, canInvite, conflictingKeys } = await loadPlanView({ params });
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return (
    <div className="flex max-w-[920px] flex-col gap-6">
      <Link href={`/dashboard/${org.slug}/plans`} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Membership plans
      </Link>
      <OrgPageHeader
        organisation={org}
        title={plan.name}
        description={`${plan._count.terms} ${plan._count.terms === 1 ? "membership" : "memberships"} on this plan so far.`}
        actions={plan.archivedAt ? <Chip>Archived</Chip> : undefined}
      />

      {canInvite && !plan.archivedAt ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="Join link and invitations" description="Share the link, or invite people directly. Invitations skip approval." />
          <PlanInvitesPanel slug={org.slug} planId={plan.id} planSlug={plan.slug} joinUrlBase={base} invites={invites} units={units} />
        </Card>
      ) : null}

      <PlanForm
        slug={org.slug}
        planId={plan.id}
        initial={planToValues(plan)}
        units={units}
        currencyLocked={plan._count.terms > 0}
        archived={Boolean(plan.archivedAt)}
        disabled={!canManagePlan}
      />

      <Card as="section" className="rounded-xl">
        <CardHeader title="Join-form questions" description="Asked when people join this plan. Answers show on the member's page and in exports." />
        <PlanFieldsEditor
          slug={org.slug}
          planId={plan.id}
          disabled={!canManagePlan}
          conflicts={conflictingKeys}
          initial={plan.fields.map(({ key, label, helpText, type, required, options, adminOnly, multiple, section, showIfKey, showIfValue }) => ({ key, label, helpText, type, required, options, adminOnly, multiple, section, showIfKey, showIfValue }))}
        />
      </Card>
    </div>
  );
}
