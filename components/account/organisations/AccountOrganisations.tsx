import Link from "next/link";
import { Plus } from "lucide-react";
import { AccountCard } from "@/components/account/AccountCard";
import { OrganisationStatusChip } from "@/components/org/OrganisationStatusChip";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, OrgLogo } from "@/components/ui/display";
import { LeaveOrganisationButton } from "./LeaveOrganisationButton";
import type { AccountMembershipRow, AccountOrganisationsData } from "./data";

const rowClasses = "flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between";

export function AccountOrganisations({ data }: { data: AccountOrganisationsData }) {
  return <TeamsCard teams={data.teamMembers} />;
}

function TeamsCard({ teams }: { teams: AccountMembershipRow[] }) {
  const apply = (
    <Button asChild size="sm" variant="secondary">
      <Link href="/start">
        <Plus aria-hidden className="size-4" />
        Apply for an organisation
      </Link>
    </Button>
  );
  return (
    <AccountCard
      id="account-orgs"
      title="Your organisations"
      description="Organisations whose team you are on, and your role in each."
      action={teams.length ? apply : undefined}
    >
      {teams.length === 0 ? (
        <EmptyState title="You're not on any organisation's team yet" action={apply}>
          Apply to run your organisation&rsquo;s memberships here, or ask an organisation owner for an invite link.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {teams.map((team) => (
            <li key={team.id} className={rowClasses}>
              <div className="flex min-w-0 items-center gap-3">
                <OrgLogo name={team.organisation.name} src={team.organisation.logoUrl} />
                <div className="min-w-0">
                  <p className="truncate text-label text-ink">{team.organisation.name}</p>
                  <p className="truncate text-caption text-ink-muted">Joined {team.joinedLabel}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Chip size="sm" tone={team.isOwner ? "ink" : "neutral"}>{team.roleName}</Chip>
                    {team.organisation.status === "ACTIVE" ? null : <OrganisationStatusChip status={team.organisation.status} />}
                  </div>
                  {team.soleOwner ? (
                    <p className="mt-1.5 text-caption text-ink-muted">You&rsquo;re the only owner, so you can&rsquo;t leave yet.</p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[52px] sm:pl-0">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/dashboard/${team.organisation.slug}`}>
                    Open dashboard
                    <span className="sr-only"> for {team.organisation.name}</span>
                  </Link>
                </Button>
                <LeaveOrganisationButton
                  organisationSlug={team.organisation.slug}
                  organisationName={team.organisation.name}
                  soleOwner={team.soleOwner}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AccountCard>
  );
}
