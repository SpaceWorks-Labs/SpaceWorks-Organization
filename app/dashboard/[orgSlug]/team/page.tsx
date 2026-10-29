import { loadOrgMembersView } from "@/lib/views/app__dashboard__orgSlug__team__page";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format/datetime";
import { OrgPageHeader } from "@/components/dashboard/org/OrgPageHeader";
import { OrgInviteLinkPanel } from "@/components/team/OrgInviteLinkPanel";
import { MemberStat, RolesCard } from "@/components/team/MemberSections";
import { TeamList } from "@/components/team/TeamList";
import { TransferOwnershipPanel } from "@/components/team/TransferOwnershipPanel";
import { OwnershipOfferPanel } from "@/components/team/OwnershipOfferPanel";
import { roleBreakdown, roleDots } from "@/components/team/memberSummary";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { cn } from "@/lib/cn";

import type { Metadata } from "next";

type Props = { params: Promise<{ orgSlug: string; }>; searchParams: Promise<{ page?: string; }>; };

const RECENT_DAYS = 30;
/** Team join dates and invite ages carry no local context; show them in UTC so every viewer sees the same label. */
const DISPLAY_TIME_ZONE = "UTC";

export const metadata: Metadata = {
  title: "Members",
  description: "Organisation members and roles.",
};



export default async function OrgMembersPage({ params, searchParams }: Props) {
  const { organisation, profile, adminView, memberCount, roleCounts, recentCount, recentHint, openInviteCount, rows, memberPages, memberPage, baseUrl, invites, units, roleOptions, canGrantOrgWide, transfer, offer, roles, canManageRoles, now } = await loadOrgMembersView({ params, searchParams });
  return (
    <div className="flex flex-col gap-7 pb-4">
      <OrgPageHeader
        organisation={{ name: organisation.name, slug: organisation.slug, logoUrl: profile.logoUrl }}
        title="Members"
        description={`The people who run ${organisation.name}, and what each of them can do.`}
      />

      <section aria-label="Team at a glance" className={cn("grid grid-cols-1 gap-4", adminView ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <MemberStat label="People" value={memberCount} hint={roleBreakdown(roleCounts)} dots={roleDots(roleCounts)} />
        <MemberStat label={`Joined in the last ${RECENT_DAYS} days`} value={recentCount} hint={recentHint} />
        {adminView ? <MemberStat label="Open invite links" value={openInviteCount} hint="Each link works once" /> : null}
      </section>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {rows.length === 0 ? (
            <EmptyState mood="sleepy">No members found.</EmptyState>
          ) : (
            <TeamList organisationSlug={organisation.slug} rows={rows} roles={roleCounts.filter((role) => role.count > 0)} showEmail={adminView} units={units} roleOptions={roleOptions} canGrantOrgWide={canGrantOrgWide} />
          )}
          {memberPages > 1 ? (
            <nav aria-label="Member pages" className="flex flex-wrap items-center justify-end gap-2">
              <p className="text-sm text-ink-muted">Page {memberPage} of {memberPages}</p>
              {memberPage <= 1 ? (
                <Button size="sm" variant="secondary" disabled>Previous</Button>
              ) : (
                <Button asChild size="sm" variant="secondary"><Link href={`?page=${memberPage - 1}`}>Previous</Link></Button>
              )}
              {memberPage >= memberPages ? (
                <Button size="sm" variant="secondary" disabled>Next</Button>
              ) : (
                <Button asChild size="sm" variant="secondary"><Link href={`?page=${memberPage + 1}`}>Next</Link></Button>
              )}
            </nav>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          {offer ? <OwnershipOfferPanel offer={offer} /> : null}
          {adminView ? (
            <OrgInviteLinkPanel
              organisationSlug={organisation.slug}
              baseUrl={baseUrl}
              roleOptions={roleOptions}
              units={units}
              canGrantOrgWide={canGrantOrgWide}
              invites={invites.map((invite) => ({
                id: invite.id,
                token: invite.token,
                grantLabel: invite.grantLabel,
                createdLabel: formatRelativeTime(invite.createdAt, DISPLAY_TIME_ZONE, now),
              }))}
            />
          ) : null}
          <RolesCard roles={roles} manageHref={canManageRoles ? `/dashboard/${organisation.slug}/settings/roles` : undefined} />
          {transfer ? (
            <TransferOwnershipPanel organisationSlug={organisation.slug} candidates={transfer.candidates} keepRoles={transfer.keepRoles} defaultKeepRoleId={transfer.defaultKeepRoleId} pending={transfer.pending} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
