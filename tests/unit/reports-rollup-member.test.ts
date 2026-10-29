import { describe, expect, it } from "vitest";
import { computeDayStats, sumStats } from "@/lib/reports/rollupCompute";
import { membershipTrend, cohortRetention } from "@/lib/reports/metrics/series";
import { periodBuckets, resolvePeriod } from "@/lib/reports/period";
import { activityCategory, actionLabel } from "@/lib/reports/activity";
import { build, ist, member, term } from "../helpers/reportFixtures";

const day = (d: string) => ({ from: ist(d), to: new Date(ist(d).getTime() + 86_400_000) });

describe("daily rollup", () => {
  const rows = [
    member("m1", { unitId: "u1", unitPath: "u1" }),
    member("m2", { unitId: "u2", unitPath: "u2" }),
  ];
  const terms = [
    term({ id: "a", member: "m1", plan: "p1", status: "ACTIVE", starts: "2026-06-01", ends: "2027-04-01" }),
    term({ id: "b", member: "m1", plan: "p2", status: "ACTIVE", starts: "2026-06-10", ends: "2027-04-01" }),
    term({ id: "c", member: "m2", plan: "p1", status: "LAPSED", starts: "2025-06-01", ends: "2026-06-01", grace: "2026-06-16" }),
  ];

  it("writes per-plan rows and an all-plans row per unit, with distinct members on the all-plans row", () => {
    const stats = computeDayStats(build(rows, terms), day("2026-06-10").from, day("2026-06-10").to);
    const find = (unit: string | null, plan: string | null) => stats.find((row) => row.unitId === unit && row.planId === plan);
    expect(find("u1", null)).toMatchObject({ active: 1, joined: 0 });
    expect(find("u1", "p2")).toMatchObject({ active: 1, joined: 1 });
    expect(find("u2", null)).toMatchObject({ active: 0, grace: 1 });
    expect(sumStats(stats.filter((row) => row.planId === null)).active).toBe(1);
  });

  it("records flows on the day they happen: joining, due, lapse", () => {
    const data = build(rows, terms);
    expect(computeDayStats(data, day("2026-06-01").from, day("2026-06-01").to).find((r) => r.unitId === "u1" && r.planId === null)).toMatchObject({ joined: 1 });
    expect(computeDayStats(data, day("2026-06-01").from, day("2026-06-01").to).find((r) => r.unitId === "u2" && r.planId === null)).toMatchObject({ due: 1 });
    expect(computeDayStats(data, day("2026-06-16").from, day("2026-06-16").to).find((r) => r.unitId === "u2" && r.planId === null)).toMatchObject({ lapsed: 1 });
  });

  it("recomputes a day from source rows: a later correction changes the rebuilt day", () => {
    const before = computeDayStats(build(rows, terms), day("2026-06-20").from, day("2026-06-20").to);
    const corrected = terms.map((t) => (t.id === "c" ? { ...t, endsAt: ist("2026-07-01"), graceUntil: ist("2026-07-16"), status: "ACTIVE" as const } : t));
    const after = computeDayStats(build(rows, corrected), day("2026-06-20").from, day("2026-06-20").to);
    expect(sumStats(before.filter((r) => r.planId === null)).active).toBe(1);
    expect(sumStats(after.filter((r) => r.planId === null)).active).toBe(2);
  });

  it("agrees with the live trend on stocks", () => {
    const data = build(rows, terms);
    const period = resolvePeriod({ period: "custom", from: "2026-06-01", to: "2026-06-30" }, { timezone: "Asia/Kolkata", financialYearStartMonth: 4 }, ist("2026-10-20"));
    const trend = membershipTrend(data, periodBuckets(period, "Asia/Kolkata"), ist("2026-10-20"));
    const live = trend.find((point) => point.key === "2026-06-10")!;
    const rolled = sumStats(computeDayStats(data, day("2026-06-10").from, day("2026-06-10").to).filter((r) => r.planId === null));
    expect([live.active, live.grace]).toEqual([rolled.active, rolled.grace]);
  });

  it("builds join-month cohorts with future cells left empty", () => {
    const cohorts = cohortRetention(build(rows, terms), "Asia/Kolkata", ist("2026-07-15"), 3, 3);
    expect(cohorts.map((row) => [row.label, row.size])).toEqual([["May 2026", 0], ["Jun 2026", 1], ["Jul 2026", 0]]);
    expect(cohorts[1].cells).toEqual([1, 1, null]);
  });
});

describe("manager activity categories", () => {
  it("groups audit actions", () => {
    expect(activityCategory("MEMBERSHIP_APPROVE")).toBe("decisions");
    expect(activityCategory("MEMBERS_EXPORTED")).toBe("exports");
    expect(activityCategory("RENEWAL_REMINDERS_SENT")).toBe("reminders");
    expect(activityCategory("SOMETHING_NEW")).toBe("other");
    expect(actionLabel("MEMBERSHIP_APPROVE")).toBe("Membership approve");
  });
});
