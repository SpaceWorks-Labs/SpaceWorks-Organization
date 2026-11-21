import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminLeaderboardView } from "@/lib/views/app__super-admin__analytics__leaderboard";
import { AnalyticsShell, RangePicker } from "@/components/super-admin/analytics/AnalyticsShell";
import { LeaderboardControls, LeaderboardPager, leaderboardHref } from "@/components/super-admin/analytics/LeaderboardControls";
import { LeaderboardTable } from "@/components/super-admin/analytics/LeaderboardTable";
import { Empty, Section } from "@/components/super-admin/analytics/parts";

export const metadata: Metadata = { title: "Organisations · Analytics", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ range?: string; sort?: string; dir?: string; page?: string; pageSize?: string; status?: string; currency?: string }> };

export default async function SuperAdminLeaderboardPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const view = await loadSuperAdminLeaderboardView({ searchParams });
  return (
    <AnalyticsShell
      tab="organisations"
      range={view.range}
      filters={
        <>
          <RangePicker ranges={view.ranges} current={view.range} hrefFor={(range) => leaderboardHref(view, { range, page: 1 })} />
          <LeaderboardControls view={view} />
        </>
      }
    >
      <Section
        id="leaderboard"
        title="Organisations ranked"
        description={`${view.label}. Growth is the change in active members over the range; renewal rate is renewals against renewals and lapses; revenue is net of refunds, one currency at a time. Last activity is the latest payment, staff sign-in or new member.`}
      >
        {view.rows.length ? (
          <>
            <LeaderboardTable view={view} />
            <LeaderboardPager view={view} />
          </>
        ) : view.status !== "all" ? (
          <Empty>
            No {view.status} organisations.{" "}
            <Link href={leaderboardHref(view, { status: "all", page: 1 })} className="font-semibold text-accent-text underline-offset-4 hover:underline">Clear filter</Link>
          </Empty>
        ) : (
          <Empty>No organisations yet.</Empty>
        )}
      </Section>
    </AnalyticsShell>
  );
}
