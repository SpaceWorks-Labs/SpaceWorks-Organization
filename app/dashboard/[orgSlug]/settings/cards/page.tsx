import type { Metadata } from "next";
import { loadOrgCardSettingsView } from "@/lib/views/app__dashboard__orgSlug__settings__cards__page";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { CardDesigner } from "@/components/cards/designer/CardDesigner";
import { DesignScopePicker } from "@/components/cards/DesignScopePicker";
import Link from "next/link";
import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";

const ROLE_CARD_STATUS = { organisation: "Uses the organisation's card", draft: "Draft waiting for approval", approved: "Own card", changes: "Own card, changes waiting" } as const;

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
      <DesignScopePicker slug={org.slug} plans={view.plans} roles={view.roles} planId={view.plan?.id ?? null} roleId={view.role?.id ?? null} source={view.source} canRevert={view.canEdit && view.approval.canApprove} />
      {view.canEdit ? (
        <CardDesigner
          key={`${view.plan?.id ?? view.role?.id ?? "organisation"}-${view.source}-${view.approval.approvedAt}-${view.approval.draftUpdatedAt}`}
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
          approval={view.approval}
          unitLevels={view.unitLevels}
        />
      ) : null}
      {view.roleCards.length ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="Role cards" description="Every member uses the organisation's card unless their main role has its own. Only the owner approves a role's card." />
          <ul className="flex flex-col gap-2">
            {view.roleCards.map((row) => (
              <li key={row.roleId} className="flex flex-wrap items-center gap-2">
                <Link href={`/dashboard/${org.slug}/settings/cards?role=${row.roleId}`} className="text-label font-semibold text-ink underline-offset-4 hover:underline">{row.name}</Link>
                <Chip size="sm" tone={row.status === "organisation" ? "neutral" : row.status === "approved" ? "success" : "warning"}>{ROLE_CARD_STATUS[row.status]}</Chip>
                <span className="text-caption text-ink-muted">{row.liveCards.toLocaleString("en-IN")} live {row.liveCards === 1 ? "card" : "cards"}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
