import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import { loadDashboardView } from "@/lib/views/app__dashboard__page";
import { OrganisationStatusChip } from "@/components/org/OrganisationStatusChip";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, OrgLogo, PageHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { firstName, teams } = await loadDashboardView();
  const apply = (
    <Link href="/start" className={buttonClasses({ variant: "primary" })}>
      <Plus aria-hidden className="size-4" />
      Apply for an organisation
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Home"
        title={`Hello, ${firstName}`}
        description={teams.length ? "Pick an organisation to manage its members, plans and payments." : undefined}
        actions={teams.length ? <Link href="/start" className={buttonClasses({ variant: "secondary" })}>Apply for another</Link> : undefined}
      />

      {teams.length === 0 ? (
        <EmptyState patch title="No organisations yet" action={apply}>
          Apply to run your organisation&rsquo;s memberships here. A platform admin reviews every application, or ask an
          organisation owner to invite you to their team.
        </EmptyState>
      ) : (
        <section aria-label="Your organisations" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {teams.map((team) => (
            <Link
              key={team.slug}
              href={`/dashboard/${team.slug}`}
              className="group flex flex-col gap-4 rounded-xl border border-line bg-panel p-5 transition-colors hover:border-line-strong"
            >
              <span className="flex items-center gap-3">
                <OrgLogo name={team.name} src={team.logoUrl} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title text-ink">{team.name}</span>
                  <span className="block truncate text-caption text-ink-muted">{[team.roleName, team.kind].filter(Boolean).join(" · ")}</span>
                </span>
                <ArrowRight aria-hidden className="size-5 shrink-0 text-ink-muted transition-colors group-hover:text-ink" />
              </span>
              {team.status === "ACTIVE" ? null : <OrganisationStatusChip status={team.status} />}
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
