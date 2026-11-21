import { describe, expect, it } from "vitest";
import { bucketIndex, fyLabel, periodBuckets, resolvePeriod } from "@/lib/reports/period";
import { inSubtree, median, ratio } from "@/lib/reports/dataset";
import { unitLeague, dataQuality, planMix, tenure } from "@/lib/reports/metrics/breakdowns";
import { approvalStats, joinFunnel } from "@/lib/reports/metrics/approvals";
import { contactFor, maskEmail, maskPhone } from "@/lib/reports/mask";
import { compactNumber, formatTick, formatValue, niceTicks, signed } from "@/lib/reports/chartScale";
import { drillHref, isDrillKey } from "@/lib/reports/drillLinks";
import { build, event, ist, member, term } from "../helpers/reportFixtures";

const KOLKATA = { timezone: "Asia/Kolkata", financialYearStartMonth: 4 };

describe("financial-year periods in the organisation's timezone", () => {
  it("starts FY 2026-27 at midnight IST on 1 April and stops at the end of today", () => {
    const period = resolvePeriod({}, KOLKATA, new Date("2026-10-20T06:30:00Z"));
    expect(period.label).toBe("FY 2026-27");
    expect(period.from.toISOString()).toBe("2026-03-31T18:30:00.000Z");
    expect(period.to.toISOString()).toBe("2026-10-20T18:30:00.000Z");
    expect(period.previous.to.toISOString()).toBe(period.from.toISOString());
  });

  it("puts 00:30 IST on 1 April in the new year, though it is still 31 March in UTC", () => {
    const now = new Date("2026-03-31T19:00:00Z");
    expect(resolvePeriod({}, KOLKATA, now).label).toBe("FY 2026-27");
    expect(resolvePeriod({}, KOLKATA, new Date("2026-03-31T18:00:00Z")).label).toBe("FY 2025-26");
  });

  it("labels last year and calendar-year organisations", () => {
    expect(resolvePeriod({ period: "last-fy" }, KOLKATA, new Date("2026-10-20T06:30:00Z")).label).toBe("FY 2025-26");
    expect(fyLabel({ year: 2026, month: 6, day: 1 }, 1)).toBe("FY 2026");
    expect(resolvePeriod({}, { timezone: "Europe/London", financialYearStartMonth: 1 }, new Date("2026-10-20T06:30:00Z")).from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("accepts a custom range in order and falls back to the year otherwise", () => {
    const custom = resolvePeriod({ period: "custom", from: "2026-05-01", to: "2026-05-31" }, KOLKATA, new Date("2026-10-20T06:30:00Z"));
    expect(custom.label).toBe("1 May 2026 to 31 May 2026");
    expect(custom.to.toISOString()).toBe("2026-05-31T18:30:00.000Z");
    expect(resolvePeriod({ period: "custom", from: "2026-06-01", to: "2026-05-01" }, KOLKATA, new Date("2026-10-20T06:30:00Z")).preset).toBe("fy");
    expect(resolvePeriod({ period: "custom", from: "2026-02-30", to: "2026-05-01" }, KOLKATA, new Date("2026-10-20T06:30:00Z")).preset).toBe("fy");
  });

  it("buckets by day up to 45 days and by month beyond, clipped to the period", () => {
    const fy = resolvePeriod({}, KOLKATA, new Date("2026-10-20T06:30:00Z"));
    const months = periodBuckets(fy, "Asia/Kolkata");
    expect(months.map((b) => b.label)).toEqual(["Apr 26", "May 26", "Jun 26", "Jul 26", "Aug 26", "Sep 26", "Oct 26"]);
    expect(months.at(-1)!.to.toISOString()).toBe(fy.to.toISOString());
    expect(bucketIndex(months, new Date("2026-04-30T18:29:59Z"))).toBe(0);
    expect(bucketIndex(months, new Date("2026-04-30T18:30:00Z"))).toBe(1);
    expect(periodBuckets(resolvePeriod({ period: "30d" }, KOLKATA, new Date("2026-10-20T06:30:00Z")), "Asia/Kolkata")).toHaveLength(30);
  });
});

describe("unit subtrees", () => {
  const units = [
    { id: "n", name: "North", path: "n", parentId: null },
    { id: "k", name: "Kozhikode", path: "n/k", parentId: "n" },
    { id: "s", name: "South", path: "s", parentId: null },
  ];
  const data = build(
    [member("m1", { unitId: "k", unitPath: "n/k" }), member("m2", { unitId: "n", unitPath: "n" }), member("m3", { unitId: "s", unitPath: "s" }), member("m4")],
    ["m1", "m2", "m3", "m4"].map((id) => term({ id: `t-${id}`, member: id, status: "ACTIVE", starts: "2026-04-01", ends: "2027-04-01" })),
  );
  const window = { from: ist("2026-04-01"), to: ist("2026-10-21") };

  it("matches a unit and everything under it, never a sibling with a shared prefix", () => {
    expect(inSubtree("n/k", "n")).toBe(true);
    expect(inSubtree("n", "n")).toBe(true);
    expect(inSubtree("nx", "n")).toBe(false);
    expect(inSubtree(null, "n")).toBe(false);
    expect(inSubtree(null, null)).toBe(true);
  });

  it("rolls each top-level unit up over its subtree, with members without a unit apart", () => {
    const league = unitLeague(data, units, null, window, ist("2026-10-20"));
    expect(league.map((row) => [row.name, row.active])).toEqual([["North", 2], ["No unit", 1], ["South", 1]]);
  });

  it("goes one level down inside a subtree", () => {
    const north = build([data.members[0], data.members[1]], data.terms.filter((t) => ["m1", "m2"].includes(t.memberId)));
    const league = unitLeague(north, units, "n", window, ist("2026-10-20"));
    expect(league.map((row) => [row.name, row.active])).toEqual([["Kozhikode", 1], ["This unit directly", 1]]);
  });

  it("counts plan mix, tenure and record gaps", () => {
    expect(planMix(data, ist("2026-10-20"))).toEqual([{ key: "plan", count: 4 }]);
    expect(tenure(data, ist("2026-10-20")).bands[0].count).toBe(4);
    const gaps = dataQuality(build([member("a", { hasPhone: false, stateCode: null }), member("b", { isMinor: true })], []), true);
    expect(gaps).toMatchObject({ members: 2, missingPhone: 1, missingState: 1, missingUnit: 2, minorsWithoutGuardian: 1 });
  });
});

describe("contact masking for viewers", () => {
  it("keeps enough to tell people apart and nothing to reach them", () => {
    expect(maskEmail("shaan@example.com")).toBe("s•••@e•••.com");
    expect(maskPhone("+91 98470 12345")).toBe("•••• 45");
    expect(contactFor(false, { email: "a@b.in", phone: null })).toEqual({ email: "a•••@b•••.in", phone: "" });
    expect(contactFor(true, { email: "a@b.in", phone: "1" })).toEqual({ email: "a@b.in", phone: "1" });
  });
});

describe("applications", () => {
  const t1 = term({ id: "t1", member: "m1", status: "ACTIVE", starts: "2026-05-03", ends: "2027-04-01" });
  const t2 = term({ id: "t2", member: "m2", status: "REJECTED", created: "2026-05-01" });
  const t3 = term({ id: "t3", member: "m3", status: "PENDING_APPROVAL", created: "2026-05-01" });
  const data = build([member("m1"), member("m2"), member("m3")], [t1, t2, t3], [
    event("t1", null, "PENDING_APPROVAL", ist("2026-05-01")), event("t1", "PENDING_APPROVAL", "PENDING_PAYMENT", ist("2026-05-03")),
    event("t2", null, "PENDING_APPROVAL", ist("2026-05-01")), event("t2", "PENDING_APPROVAL", "REJECTED", ist("2026-05-02")),
    event("t3", null, "PENDING_APPROVAL", ist("2026-05-01")),
  ]);

  it("measures the median time to approve over approvals only", () => {
    const stats = approvalStats(data, { from: ist("2026-04-01"), to: ist("2026-10-21") }, ist("2026-10-20"));
    expect(stats).toMatchObject({ received: 3, approved: 1, rejected: 1, waiting: 1, waitingOver7Days: 1, medianHoursToApprove: 48, approvalRate: 0.5 });
  });

  it("follows the funnel from start to active, each step a subset of the last", () => {
    const funnel = joinFunnel(data, { from: ist("2026-04-01"), to: ist("2026-10-21") }, ist("2026-10-20"));
    expect(funnel.map((step) => step.count)).toEqual([3, 1, 1, 1]);
    expect(funnel[1].dropOff).toBeCloseTo(2 / 3);
  });
});

describe("chart helpers", () => {
  it("rounds axes and formats values", () => {
    expect(niceTicks(215)).toEqual([0, 100, 200, 300]);
    expect(niceTicks(1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(1, 4, { integer: true })).toEqual([0, 1]);
    expect(niceTicks(3, 4, { integer: true })).toEqual([0, 1, 2, 3]);
    expect(niceTicks(215, 4, { integer: true })).toEqual([0, 100, 200, 300]);
    expect(compactNumber(12_900)).toBe("13K");
    expect(formatValue(null, "percent")).toBe("—");
    expect(formatValue(0.756, "percent")).toBe("76%");
    expect(formatValue(120_000, "money:INR")).toBe("₹1,200.00");
    expect(formatTick(250_000, "money:INR")).toBe("2.5K");
    expect(signed(-3)).toBe("−3");
    expect(signed(0.11, "percent")).toBe("+11 pts");
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(ratio(1, 0)).toBeNull();
  });

  it("builds drill-down links the directory understands", () => {
    expect(isDrillKey("lapsed")).toBe(true);
    expect(isDrillKey("everything")).toBe(false);
    expect(drillHref("spaceworks", "lapsed", { period: "fy", unit: "u1", plan: "p1" })).toBe("/dashboard/spaceworks/members?drill=lapsed&period=fy&plan=p1&dunit=u1");
  });
});
