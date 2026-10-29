import Link from "next/link";
import type { Metadata } from "next";
import { loadOrgUnitView } from "@/lib/views/app__dashboard__orgSlug__settings__structure__unitId__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { MoveUnitForm } from "@/components/settings/MoveUnitForm";
import { UnitPaymentInstructionsForm } from "@/components/settings/UnitPaymentInstructionsForm";
import { CopyField } from "@/components/settings/payments/CopyField";
import { Callout, Card, CardHeader, Chip, EmptyState } from "@/components/ui/display";

export const metadata: Metadata = { title: "Unit", robots: { index: false, follow: false } };

export default async function OrgUnitPage({ params }: { params: Promise<{ orgSlug: string; unitId: string }> }) {
  const view = await loadOrgUnitView({ params });
  const { org, unit } = view;
  const base = `/dashboard/${org.slug}/settings/structure`;
  return (
    <div className="flex flex-col gap-6">
      <OrgPageHeader organisation={org} title={unit.name} description={`${unit.levelName} · code ${unit.code} · ${view.members} ${view.members === 1 ? "member" : "members"} here and below`} />
      <SettingsTabs slug={org.slug} />
      <nav aria-label="Where this unit sits" className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        <Link href={base} className="underline-offset-4 hover:underline">Units and roles</Link>
        {view.trail.map((entry) => (
          <span key={entry.id} className="flex items-center gap-1.5">
            <span aria-hidden>/</span>
            <Link href={`${base}/${entry.id}`} className="underline-offset-4 hover:underline">{entry.name}</Link>
          </span>
        ))}
        <span aria-hidden>/</span>
        <span className="text-ink">{unit.name}</span>
        {unit.archived ? <Chip size="sm" tone="neutral">Archived</Chip> : null}
      </nav>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card as="section" className="h-fit rounded-xl">
          <CardHeader title="Join links" description="Share a link and new members land in this unit, already chosen." />
          {view.joinLinks.length ? (
            <div className="flex flex-col gap-4">
              {view.joinLinks.map((link) => <CopyField key={link.url} label={link.plan} value={link.url} />)}
            </div>
          ) : <EmptyState mood="sleepy">{unit.archived ? "Archived units take no new members." : "No open plan is offered here."}</EmptyState>}
        </Card>

        <Card as="section" className="h-fit rounded-xl">
          <CardHeader title="Team" description="Staff whose reach includes this unit. Limit someone to a unit from the Team page." />
          {view.staff.length ? (
            <ul className="flex flex-col gap-2">
              {view.staff.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-label font-semibold text-ink">{person.name}</span>
                  <Chip size="sm" tone="neutral">{person.role}</Chip>
                  <span className="text-caption text-ink-muted">{person.reach}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState mood="sleepy">Only organisation-wide staff look after this unit.</EmptyState>}
        </Card>

        <Card as="section" className="h-fit rounded-xl">
          <CardHeader title="Payments" description="What members of this unit and the units under it see when they pay offline." />
          <UnitPaymentInstructionsForm slug={org.slug} unitId={unit.id} initial={view.payment.instructions} inherited={view.payment.inherited} canEdit={view.canEdit} />
        </Card>

        {view.childLevelName ? (
          <Card as="section" className="h-fit rounded-xl">
            <CardHeader title={`${view.childLevelName} units`} />
            {view.children.length ? (
              <ul className="flex flex-col gap-2">
                {view.children.map((child) => (
                  <li key={child.id} className="flex items-center gap-2">
                    <Link href={`${base}/${child.id}`} className="text-label font-semibold text-ink underline-offset-4 hover:underline">{child.name}</Link>
                    <span className="text-caption text-ink-muted">{child.code}</span>
                    {child.archivedAt ? <Chip size="sm" tone="neutral">Archived</Chip> : null}
                  </li>
                ))}
              </ul>
            ) : <EmptyState mood="sleepy">None yet. Add them from Units and roles.</EmptyState>}
          </Card>
        ) : null}

        {view.parentLevelName && view.canEdit && !unit.archived ? (
          <Card as="section" className="h-fit rounded-xl">
            <CardHeader title="Move" description={`Move ${unit.name} and everything under it to another ${view.parentLevelName.toLowerCase()}. Members keep their unit and card numbers.`} />
            <MoveUnitForm slug={org.slug} unitId={unit.id} parentLevelName={view.parentLevelName} parents={view.parents} />
          </Card>
        ) : null}
      </div>
      {!view.canEdit ? <Callout tone="info">You manage one unit, so the organisation&apos;s structure is read-only for you.</Callout> : null}
    </div>
  );
}
