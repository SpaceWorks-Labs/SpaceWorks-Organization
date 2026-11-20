"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MemberRoleActions } from "@/components/team/MemberRoleActions";
import { MemberUnitScope } from "@/components/team/MemberUnitScope";
import { MemberGroupingScope } from "@/components/team/MemberGroupingScope";
import { filterTeam, grantLabel, matchesFilter, type TeamFilter, type TeamGroupingOption, type TeamMemberRow, type TeamRoleOption, type TeamUnitOption } from "@/components/team/memberSummary";
import { Avatar, Chip, EmptyState } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function TeamList({
  organisationSlug,
  rows,
  roles,
  showEmail,
  units = [],
  roleOptions = [],
  canGrantOrgWide = false,
  groupings = [],
  canViewActivity = false,
}: {
  organisationSlug: string;
  rows: TeamMemberRow[];
  /** Roles someone holds, in role order: one filter tab each. */
  roles: Array<{ id: string; name: string }>;
  showEmail: boolean;
  /** Units the viewer may give access to (their own subtree). */
  units?: TeamUnitOption[];
  /** Roles the viewer may give, and at which reach. */
  roleOptions?: TeamRoleOption[];
  canGrantOrgWide?: boolean;
  /** Groupings the viewer may limit staff to. */
  groupings?: TeamGroupingOption[];
  /** Whether the viewer may open the activity log, to link each person's actions. */
  canViewActivity?: boolean;
}) {
  const [filter, setFilter] = useState<TeamFilter>("everyone");
  const [query, setQuery] = useState("");

  const filters = useMemo(
    () => [{ value: "everyone", label: "Everyone" }, ...roles.map((role) => ({ value: role.id, label: role.name }))]
      .map((item) => ({ ...item, count: rows.filter((row) => matchesFilter(row, item.value)).length })),
    [rows, roles],
  );
  const visible = useMemo(() => filterTeam(rows, filter, query), [rows, filter, query]);

  return (
    <section aria-labelledby="team-title" className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="team-title" className="text-h4 text-ink">Team</h2>
        <div className="w-full min-w-0 sm:w-[260px]">
          <label htmlFor="team-search" className="sr-only">Search members</label>
          <SearchField
            id="team-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={showEmail ? "Search by name or email" : "Search by name"}
            autoComplete="off"
          />
        </div>
      </div>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as TeamFilter)}>
        <TabsList aria-label="Filter by role">
          {filters.map(({ value, label, count }) => (
            <TabsTrigger key={value} value={value}>
              {label}
              <span className="font-medium text-ink-muted">{count}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {filters.map(({ value }) => (
          <TabsContent key={value} value={value} className="pt-3.5">
            {visible.length === 0 ? (
              rows.length === 0 ? (
                <EmptyState>No one here yet.</EmptyState>
              ) : (
                <EmptyState
                  mood="sleepy"
                  title="No one matches these filters"
                  action={<Button variant="secondary" onClick={() => { setFilter("everyone"); setQuery(""); }}>Clear filters</Button>}
                />
              )
            ) : (
              <ul className="flex flex-col gap-2">
                {visible.map((row) => (
                  <li key={row.id} className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-lg border border-line bg-panel px-4 py-3">
                    <Avatar name={row.name ?? row.email ?? null} size="md" tone={row.isOwner ? "ink" : "neutral"} />
                    <div className="flex min-w-0 flex-[1_1_200px] flex-col">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-bold text-ink">{row.name ?? "Unnamed member"}</span>
                        {row.isYou ? <Chip size="sm" className="shrink-0">You</Chip> : null}
                      </span>
                      <span className="truncate text-caption text-ink-muted">
                        {grantLabel(row.roleName, row.unitName)} · {showEmail && row.email ? `${row.email} · ` : ""}Joined {row.joinedLabel}
                      </span>
                    </div>
                    <div className="ml-auto flex min-w-0 max-w-full flex-wrap justify-end gap-2">
                      {canViewActivity ? <Link href={`/dashboard/${organisationSlug}/activity?actor=${row.userId}`} className="self-center text-caption text-ink-muted underline-offset-4 hover:text-ink hover:underline">View activity</Link> : null}
                      {row.manageable && (units.length || row.unitId) ? (
                        <MemberUnitScope organisationSlug={organisationSlug} row={row} units={units} roleOptions={roleOptions} canGrantOrgWide={canGrantOrgWide} />
                      ) : null}
                      {row.manageable ? <MemberGroupingScope organisationSlug={organisationSlug} row={row} groupings={groupings} /> : null}
                      <MemberRoleActions organisationSlug={organisationSlug} row={row} roleOptions={roleOptions} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
