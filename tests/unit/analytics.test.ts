import { describe, expect, it } from "vitest";
import { computeDayStats, sumStats } from "@/lib/reports/rollupCompute";
import { expiredAt } from "@/lib/reports/metrics/standing";
import { levelLeague } from "@/lib/reports/metrics/levels";
import { dueByWeek, monthlyFromDays, seriesByCurrency } from "@/lib/reports/analytics";
import { amountsByOrg, applicationsByMonth, comparisonCsv, comparisonRows, failuresByOrg, parseSort, sortComparison, tableCurrencies, topLevelBreakdown, type OrgFacts } from "@/lib/reports/platformAnalytics";
import { build, event, ist, member, term } from "../helpers/reportFixtures";
import { payment, refund } from "../helpers/financeFixtures";

const day = (d: string) => ({ from: ist(d), to: new Date(ist(d).getTime() + 86_400_000) });

describe("expired stock in the daily rollup", () => {
  const members = [
    member("m1", { unitId: "u1", unitPath: "u1" }),
    member("m2", { unitId: "u1", unitPath: "u1" }),
    member("m3", { unitId: "u2", unitPath: "u2" }),
    member("m4", { unitId: "u2", unitPath: "u2" }),
    member("m5", { unitId: "u2", unitPath: "u2" }),
  ];
  const terms = [
    // m1 lapsed: expired once grace ends.
    term({ id: "a", member: "m1", plan: "p1", status: "LAPSED", starts: "2025-06-01", ends: "2026-06-01", grace: "2026-06-16" }),
    // m2 lapsed on p1 but is active on p2: not expired anywhere.
    term({ id: "b", member: "m2", plan: "p1", status: "LAPSED", starts: "2025-06-01", ends: "2026-06-01" }),
    term({ id: "c", member: "m2", plan: "p2", status: "ACTIVE", starts: "2026-05-01", ends: "2027-05-01" }),
    // m3 revoked: not expired.
    term({ id: "d", member: "m3", plan: "p1", status: "REVOKED", starts: "2025-06-01", ends: "2026-06-01" }),
    // m4 ended, and a paid renewal starts later: still holds a live (upcoming) term.
    term({ id: "e", member: "m4", plan: "p1", status: "ENDED", starts: "2025-06-01", ends: "2026-06-01" }),
    term({ id: "f", member: "m4", plan: "p1", status: "UPCOMING", starts: "2026-07-01", ends: "2027-07-01", created: "2026-05-20" }),
    // m5 never activated.
    term({ id: "g", member: "m5", plan: "p1", status: "PENDING_PAYMENT", created: "2026-05-01" }),
  ];
  // The renewal was paid on 20 May, well before it starts.
  const data = build(members, terms, [event("f", "PENDING_PAYMENT", "UPCOMING", ist("2026-05-20"))]);

  it("counts members whose latest membership ended with no live one, on the all-plans and plan rows", () => {
    const stats = computeDayStats(data, day("2026-06-20").from, day("2026-06-20").to);
    const find = (unit: string, plan: string | null) => stats.find((row) => row.unitId === unit && row.planId === plan);
    expect(find("u1", null)).toMatchObject({ active: 1, expired: 1 });
    expect(find("u1", "p1")).toMatchObject({ expired: 1 });
    expect(find("u2", null)?.expired ?? 0).toBe(0);
    expect(sumStats(stats.filter((row) => row.planId === null)).expired).toBe(1);
  });

  it("keeps one zero all-plans row for a day with nothing to count", () => {
    const quiet = computeDayStats(build([], []), day("2026-06-20").from, day("2026-06-20").to);
    expect(quiet).toEqual([expect.objectContaining({ unitId: null, planId: null, active: 0, grace: 0, expired: 0, joined: 0 })]);
  });

  it("is not expired while in grace, and the upcoming term only counts once it was paid", () => {
    expect(expiredAt(data.termsByMember.get("m1")!, data.termsByMember.get("m1")!, ist("2026-06-10"))).toBe(false);
    expect(expiredAt(data.termsByMember.get("m1")!, data.termsByMember.get("m1")!, ist("2026-06-17"))).toBe(true);
    // m4's term ended on 1 June, but the renewal paid on 20 May is still to start.
    expect(expiredAt(data.termsByMember.get("m4")!, data.termsByMember.get("m4")!, ist("2026-06-10"))).toBe(false);
  });
});

describe("level league", () => {
  const units = [
    { id: "n", name: "North", path: "n" },
    { id: "n1", name: "North 1", path: "n/n1" },
    { id: "n2", name: "North 2", path: "n/n2" },
    { id: "s", name: "South", path: "s" },
  ];
  const members = [
    member("m1", { unitId: "n1", unitPath: "n/n1" }),
    member("m2", { unitId: "n2", unitPath: "n/n2" }),
    member("m3", { unitId: "s", unitPath: "s" }),
    member("m4", { unitId: "n", unitPath: "n" }),
  ];
  const terms = [
    term({ id: "a", member: "m1", status: "ACTIVE", starts: "2026-01-01", ends: "2027-01-01" }),
    term({ id: "b", member: "m2", status: "ACTIVE", starts: "2026-10-01", ends: "2027-10-01" }),
    term({ id: "c", member: "m3", status: "LAPSED", starts: "2025-07-01", ends: "2026-07-01" }),
    term({ id: "d", member: "m4", status: "ACTIVE", starts: "2026-02-01", ends: "2027-02-01" }),
  ];
  const data = build(members, terms);
  const now = ist("2026-10-20");
  const window = { from: ist("2026-04-01"), to: now };
  const money = {
    paid: [payment("p1", { memberId: "m1", amountMinor: 50_000 }), payment("p2", { memberId: "m2", currency: "USD", amountMinor: 2_000 }), payment("p3", { memberId: "m3", amountMinor: 30_000 })],
    refunds: [{ ...refund("r1", "p1", 10_000), memberId: "m1" }],
    open: [payment("p4", { memberId: "m2", status: "PENDING", paidAt: null, amountMinor: 7_000 })],
    unpaid: [],
  };

  it("lists the top level with whole-subtree counts, growth and money per currency", () => {
    const rows = levelLeague(data, units, null, window, now, money, "INR");
    const north = rows.find((row) => row.unitId === "n")!;
    expect(north).toMatchObject({ active: 3, active30: 2, active90: 2, hasChildren: true });
    expect(north.growth30).toBeCloseTo(0.5);
    expect(north.collected).toEqual([{ currency: "INR", minor: 40_000 }, { currency: "USD", minor: 2_000 }]);
    expect(north.outstanding).toEqual([{ currency: "INR", minor: 7_000 }]);
    const south = rows.find((row) => row.unitId === "s")!;
    expect(south).toMatchObject({ active: 0, renewalRate: 0, hasChildren: false });
  });

  it("drills into one unit: its children, plus members on the unit itself", () => {
    const rows = levelLeague(data, units, "n", window, now, null);
    expect(rows.map((row) => row.name)).toEqual(["North 1", "North 2", "This unit directly"]);
    expect(rows.every((row) => row.collected === null)).toBe(true);
  });

  it("keeps a unit's direct row while it has 30-day growth to show, even with nobody active now", () => {
    const recent = build(
      [member("m5", { unitId: "s", unitPath: "s" })],
      [term({ id: "e", member: "m5", status: "REVOKED", starts: "2026-09-01", ends: "2027-09-01", grace: null })],
      [event("e", "PENDING_PAYMENT", "ACTIVE", ist("2026-09-01")), event("e", "ACTIVE", "REVOKED", ist("2026-10-05"))],
    );
    const rows = levelLeague(recent, units, "s", window, now, null);
    expect(rows).toEqual([expect.objectContaining({ name: "This unit directly", active: 0, active30: 1, active90: 0 })]);
  });
});

describe("analytics shapers", () => {
  it("splits money per currency and never adds currencies together", () => {
    const series = seriesByCurrency([{ key: "a", label: "Jan", gross: [{ currency: "INR", minor: 100 }, { currency: "USD", minor: 5 }], refunds: [], net: [{ currency: "INR", minor: 100 }, { currency: "USD", minor: 5 }] }], "INR");
    expect(series.map((s) => [s.currency, s.points[0].gross])).toEqual([["INR", 100], ["USD", 5]]);
  });

  it("buckets renewals due by week from now", () => {
    const now = new Date("2026-10-29T06:00:00Z");
    const weeks = dueByWeek([new Date("2026-10-30T00:00:00Z"), new Date("2026-11-27T00:00:00Z"), new Date("2026-12-30T00:00:00Z")], now, "Asia/Kolkata");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toMatchObject({ label: "29 Oct to 4 Nov", count: 1 });
    expect(weeks.reduce((sum, week) => sum + week.count, 0)).toBe(2);
  });

  it("reads month stocks from the last rolled-up day and sums flows", () => {
    const rows = [
      { day: new Date("2026-09-03"), active: 5, grace: 1, expired: 2, joined: 2, lapsed: 0, renewed: 1 },
      { day: new Date("2026-09-30"), active: 6, grace: 0, expired: 3, joined: 1, lapsed: 1, renewed: 0 },
    ];
    const [sep, oct] = monthlyFromDays(rows, [{ key: "2026-09", label: "Sep 26", first: new Date("2026-09-01"), last: new Date("2026-09-30") }, { key: "2026-10", label: "Oct 26", first: new Date("2026-10-01"), last: new Date("2026-10-29") }]);
    expect(sep).toMatchObject({ active: 6, expired: 3, joined: 3, lapsed: 1, renewed: 1 });
    expect(oct).toMatchObject({ active: null, joined: 0 });
  });

  it("closes a month at zero when its last members ended mid-month", () => {
    // The rollup keeps a zero row for a computed day with nothing to count (computeDayStats).
    const rows = [
      { day: new Date("2026-09-14"), active: 1, grace: 0, expired: 0, joined: 0, lapsed: 0, renewed: 0 },
      { day: new Date("2026-09-30"), active: 0, grace: 0, expired: 0, joined: 0, lapsed: 0, renewed: 0 },
    ];
    const [sep] = monthlyFromDays(rows, [{ key: "2026-09", label: "Sep 26", first: new Date("2026-09-01"), last: new Date("2026-09-30") }]);
    expect(sep).toMatchObject({ active: 0 });
  });
});

describe("platform comparison", () => {
  const now = new Date("2026-10-29T00:00:00Z");
  const fact = (id: string, extra: Partial<OrgFacts> = {}): OrgFacts => ({
    id, name: id, status: "ACTIVE", createdAt: new Date("2025-01-01"), members: 10, memberLimit: null, team: 2, managerLimit: null,
    active: 10, active30: 8, active90: 5, renewed: 3, lapsed: 1, revenue: [], outstanding: [], lastSignIn: null, lastPayment: null, ...extra,
  });

  it("derives growth, renewal rate, limits used and the dormant flag", () => {
    const [busy, quiet, fresh] = comparisonRows([
      fact("Example Network", { lastSignIn: new Date("2026-10-20"), memberLimit: 20, team: 3, managerLimit: 4 }),
      fact("North", { lastPayment: new Date("2026-07-01"), active30: 0 }),
      fact("South", { createdAt: new Date("2026-10-01") }),
    ], now);
    expect(busy).toMatchObject({ growth30: 0.25, growth90: 1, renewalRate: 0.75, limitShare: 0.75, dormant: false });
    expect(quiet).toMatchObject({ growth30: null, dormant: true });
    expect(fresh.dormant).toBe(false);
  });

  it("sorts by any column with empty values last, and money by one currency", () => {
    const rows = comparisonRows([fact("A", { revenue: [{ currency: "INR", minor: 5 }] }), fact("B", { revenue: [{ currency: "INR", minor: 9 }, { currency: "USD", minor: 1_000 }] }), fact("C", { active: null })], now);
    expect(sortComparison(rows, "revenue", "desc", "INR").map((r) => r.name)).toEqual(["B", "A", "C"]);
    expect(sortComparison(rows, "active", "asc", "INR").map((r) => r.name)).toEqual(["A", "B", "C"]);
    expect(parseSort("nope", "sideways")).toEqual({ key: "active", dir: "desc" });
  });

  it("totals money per organisation and currency, refunds netted, never across currencies", () => {
    const totals = amountsByOrg([{ organisationId: "o1", currency: "INR", amountMinor: 100 }, { organisationId: "o1", currency: "USD", amountMinor: 7 }], [{ organisationId: "o1", currency: "INR", amountMinor: 40 }]);
    expect(totals.get("o1")).toEqual(expect.arrayContaining([{ currency: "INR", minor: 60 }, { currency: "USD", minor: 7 }]));
    expect(tableCurrencies([{ revenue: totals.get("o1")!, outstanding: [] }])).toEqual(["INR", "USD"]);
  });

  it("writes one CSV column per currency", () => {
    const csv = comparisonCsv(comparisonRows([fact("Example Network", { revenue: [{ currency: "INR", minor: 12_345 }] })], now), ["INR", "USD"]);
    expect(csv.header).toEqual(expect.arrayContaining(["Revenue 12 months INR", "Revenue 12 months USD", "Outstanding INR"]));
    expect(csv.rows[0][csv.header.indexOf("Revenue 12 months INR")]).toBe("123.45");
    expect(csv.rows[0][csv.header.indexOf("Dormant")]).toBe("Yes");
  });

  it("counts the applications funnel, failures and the top-level breakdown", () => {
    const months = [{ key: "2026-10", label: "Oct 26", from: new Date("2026-10-01"), to: now }];
    expect(applicationsByMonth([{ action: "SUBMITTED", createdAt: new Date("2026-10-02") }, { action: "APPROVED", createdAt: new Date("2026-10-03") }, { action: "CREATED", createdAt: new Date("2026-10-04") }, { action: "REJECTED", createdAt: new Date("2026-09-04") }], months)[0]).toMatchObject({ live: 2, applied: 1, declined: 0 });
    const failures = failuresByOrg(new Map([["o1", "North"], ["o2", "South"]]), new Map([["o1", 2]]), new Map([["o2", 5], ["gone", 1]]), new Map());
    expect(failures.map((row) => [row.name, row.total])).toEqual([["South", 5], ["North", 2]]);
    const breakdown = topLevelBreakdown([{ unitId: "n1", active: 3, grace: 1, expired: 0 }, { unitId: "n", active: 1, grace: 0, expired: 2 }, { unitId: null, active: 2, grace: 0, expired: 0 }], [{ id: "n", name: "North", path: "n" }, { id: "n1", name: "North 1", path: "n/n1" }]);
    expect(breakdown).toEqual([{ key: "n", name: "North", active: 4, grace: 1, expired: 2 }, { key: "none", name: "No unit", active: 2, grace: 0, expired: 0 }]);
  });
});
