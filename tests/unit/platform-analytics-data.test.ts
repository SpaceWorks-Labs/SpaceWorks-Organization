import { describe, expect, it } from "vitest";
import { growthHeadlines, growthSeries, organisationSeries, organisationStatuses, periodTotals, type PlatformDay } from "@/lib/reports/platformGrowth";
import { leaderboardRows, pageLeaderboard, parseLeaderboardQuery, sortLeaderboard, type LeaderboardFacts } from "@/lib/reports/platformLeaderboard";
import { bucketKey, platformMoney } from "@/lib/reports/platformMoney";
import { ageSeconds, chatAlertRollup, emailRollup, heartbeatStatuses, memberMessageRollup, opsWindow, outboxChannel, outboxRollup, signInRollup, smsCodeRollup, type OutboxGroup } from "@/lib/reports/platformOps";
import { compare, compareRate, parsePlatformRange, platformWindow } from "@/lib/reports/platformRange";

const now = new Date("2026-11-21T10:00:00Z");
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("platform range and comparison", () => {
  it("falls back to 12 months and builds day or month buckets", () => {
    expect(parsePlatformRange("nonsense")).toBe("12m");
    const year = platformWindow("12m", now);
    expect(year.unit).toBe("month");
    expect(year.buckets.at(0)?.key).toBe("2025-11");
    expect(year.buckets.at(-1)?.key).toBe("2026-11");
    expect(year.to.toISOString()).toBe("2026-11-22T00:00:00.000Z");
    const days = platformWindow("30d", now);
    expect(days.unit).toBe("day");
    expect(days.buckets).toHaveLength(30);
    expect(days.previous.to.getTime()).toBe(days.from.getTime());
  });

  it("uses the April to March financial year", () => {
    const fy = platformWindow("fy", now);
    expect(fy.from.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(fy.buckets).toHaveLength(8);
  });

  it("compares with delta and percentage, and leaves the percentage out for rates and zero bases", () => {
    expect(compare(150, 100)).toEqual({ current: 150, previous: 100, delta: 50, pct: 0.5 });
    expect(compare(5, 0)).toMatchObject({ delta: 5, pct: null });
    expect(compare(null, 4)).toEqual({ current: null, previous: 4, delta: null, pct: null });
    expect(compareRate(0.75, 0.5)).toMatchObject({ delta: 0.25, pct: null });
  });
});

const day = (iso: string, over: Partial<PlatformDay>): PlatformDay => ({ day: d(iso), active: 0, grace: 0, expired: 0, joined: 0, reactivated: 0, due: 0, renewed: 0, lapsed: 0, applications: 0, ...over });

describe("growth, renewal rate and churn", () => {
  const days = [
    day("2026-09-30", { active: 100 }),
    day("2026-10-10", { active: 110, joined: 12, renewed: 6, lapsed: 2 }),
    day("2026-10-31", { active: 120, joined: 10, renewed: 6, lapsed: 2, reactivated: 1 }),
    day("2026-08-15", { active: 90, joined: 5, renewed: 2, lapsed: 2 }),
  ];
  const october = { from: d("2026-10-01"), to: d("2026-11-01") };

  it("sums flows and reads stocks at the period edges", () => {
    const totals = periodTotals(days, october);
    expect(totals).toMatchObject({ joined: 22, renewed: 12, lapsed: 4, reactivated: 1, activeStart: 100, activeEnd: 120 });
    expect(totals.renewalRate).toBeCloseTo(12 / 16);
    expect(totals.churnRate).toBeCloseTo(4 / 100);
  });

  it("has null rates with nothing decided or no starting stock", () => {
    const totals = periodTotals([day("2026-10-02", { active: 5, joined: 5 })], october);
    expect(totals.renewalRate).toBeNull();
    expect(totals.churnRate).toBeNull();
  });

  it("builds the bucket series with closing stocks", () => {
    const series = growthSeries(days, [{ key: "2026-10", label: "Oct 26", ...october }]);
    expect(series[0]).toMatchObject({ active: 120, joined: 22, lapsed: 4, reinstated: 1 });
  });

  it("sets every headline against the previous period", () => {
    const previous = { from: d("2026-08-01"), to: d("2026-10-01") };
    const orgs = [
      { createdAt: d("2026-01-01"), status: "ACTIVE" },
      { createdAt: d("2026-10-05"), status: "ACTIVE" },
      { createdAt: d("2026-10-20"), status: "SUSPENDED" },
      { createdAt: d("2026-10-21"), status: "PENDING_REVIEW" },
    ];
    const h = growthHeadlines({ days, orgs, memberCounts: { current: 130, previous: 100 }, current: october, previous });
    expect(h.organisationsLive).toMatchObject({ current: 3, previous: 1, delta: 2 });
    expect(h.organisationsCreated.current).toBe(3);
    expect(h.membersTotal).toMatchObject({ delta: 30, pct: 0.3 });
    expect(h.joins).toMatchObject({ current: 22, previous: 5 });
    expect(h.renewalRate.current).toBeCloseTo(0.75);
    expect(h.renewalRate.previous).toBeCloseTo(0.5);
    expect(h.renewalRate.pct).toBeNull();
    expect(h.membersActive.current).toBe(120);
  });

  it("counts organisations per bucket and by status", () => {
    const orgs = [{ createdAt: d("2026-10-05"), status: "ACTIVE" }, { createdAt: d("2026-09-05"), status: "SUSPENDED" }, { createdAt: d("2026-10-06"), status: "REJECTED" }];
    const series = organisationSeries(orgs, [{ key: "2026-09", label: "Sep", from: d("2026-09-01"), to: d("2026-10-01") }, { key: "2026-10", label: "Oct", ...october }]);
    expect(series.map((row) => [row.created, row.live])).toEqual([[1, 1], [2, 2]]);
    expect(organisationStatuses(orgs)).toEqual({ total: 3, active: 1, suspended: 1, pending: 0, closed: 1 });
  });
});

describe("money by currency", () => {
  const buckets = [{ key: "2026-10", label: "Oct 26", from: d("2026-10-01"), to: d("2026-11-01") }, { key: "2026-11", label: "Nov 26", from: d("2026-11-01"), to: d("2026-11-22") }];
  const result = platformMoney({
    buckets,
    unit: "month",
    payments: [
      { bucket: d("2026-10-01"), currency: "INR", provider: "RAZORPAY", amountMinor: 500_000, count: 5 },
      { bucket: d("2026-10-01"), currency: "INR", provider: "OFFLINE", amountMinor: 100_000, count: 2 },
      { bucket: d("2026-11-01"), currency: "USD", provider: "STRIPE", amountMinor: 20_000, count: 1 },
    ],
    refunds: [{ bucket: d("2026-10-01"), currency: "INR", amountMinor: 50_000, count: 1 }],
    previousPayments: [{ bucket: d("2026-09-01"), currency: "INR", provider: "OFFLINE", amountMinor: 300_000, count: 3 }],
    previousRefunds: [],
    outstanding: [{ currency: "INR", amountMinor: 40_000 }, { currency: "INR", amountMinor: 10_000 }, { currency: "EUR", amountMinor: 7_000 }],
  });

  it("keeps every currency apart and sorts the largest first", () => {
    expect(result.map((row) => row.currency)).toEqual(["INR", "USD", "EUR"]);
    const inr = result[0];
    expect(inr).toMatchObject({ collected: 600_000, refunds: 50_000, net: 550_000, online: 500_000, inHand: 100_000, outstanding: 50_000, payments: 7 });
    expect(result[1]).toMatchObject({ currency: "USD", collected: 20_000, online: 20_000, inHand: 0, outstanding: 0 });
    expect(result[2]).toMatchObject({ currency: "EUR", collected: 0, outstanding: 7_000 });
  });

  it("splits by bucket and compares with the previous period", () => {
    const inr = result[0];
    expect(inr.points.map((point) => point.net)).toEqual([550_000, 0]);
    expect(inr.comparison.collected).toMatchObject({ current: 600_000, previous: 300_000, delta: 300_000, pct: 1 });
    expect(inr.comparison.inHand.previous).toBe(300_000);
    expect(bucketKey(d("2026-11-01"), "month")).toBe("2026-11");
    expect(bucketKey(d("2026-11-05"), "day")).toBe("2026-11-05");
  });
});

describe("leaderboard", () => {
  const facts = (over: Partial<LeaderboardFacts> & { id: string; name: string }): LeaderboardFacts => ({
    slug: over.id, status: "ACTIVE", createdAt: d("2026-01-01"), members: 10, activeStart: 10, activeEnd: 10, renewed: 0, lapsed: 0, revenue: [], lastActivityAt: null, ...over,
  });
  const rows = leaderboardRows([
    facts({ id: "a", name: "Alpha", activeStart: 10, activeEnd: 15, renewed: 3, lapsed: 1, revenue: [{ currency: "INR", minor: 100 }], lastActivityAt: d("2026-11-01"), members: 40 }),
    facts({ id: "b", name: "Beta", activeStart: 20, activeEnd: 22, revenue: [{ currency: "INR", minor: 900 }, { currency: "USD", minor: 5 }], members: 5 }),
    facts({ id: "c", name: "Gamma", activeStart: null, activeEnd: 4, status: "SUSPENDED", revenue: [{ currency: "USD", minor: 70 }], members: 90 }),
    facts({ id: "d", name: "Delta", activeStart: 0, activeEnd: 3, members: 1 }),
  ]);

  it("derives growth, renewal rate and the link", () => {
    expect(rows[0]).toMatchObject({ growth: 0.5, renewalRate: 0.75, href: "/super-admin/orgs/a/analytics" });
    expect(rows[2].growth).toBeNull();
    expect(rows[3].growth).toBeNull();
  });

  it("sorts with empty values last in both directions", () => {
    expect(sortLeaderboard(rows, "growth", "desc", "INR").map((row) => row.id)).toEqual(["a", "b", "d", "c"]);
    expect(sortLeaderboard(rows, "growth", "asc", "INR").map((row) => row.id).slice(0, 2)).toEqual(["b", "a"]);
    expect(sortLeaderboard(rows, "revenue", "desc", "USD").map((row) => row.id).slice(0, 2)).toEqual(["c", "b"]);
    expect(sortLeaderboard(rows, "revenue", "desc", "USD").at(-1)?.id).toBe("d");
    expect(sortLeaderboard(rows, "name", "asc", "INR").map((row) => row.name)).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);
    expect(sortLeaderboard(rows, "activity", "asc", "INR")[0].id).toBe("a");
  });

  it("filters by status, paginates and clamps the page", () => {
    const query = parseLeaderboardQuery({ sort: "members", dir: "desc", page: "9", pageSize: "10", status: "suspended" });
    const page = pageLeaderboard(rows, query);
    expect(page).toMatchObject({ total: 1, page: 1, pageCount: 1, currency: "USD" });
    const first = pageLeaderboard(rows, parseLeaderboardQuery({ sort: "members", pageSize: "10" }));
    expect(first.rows.map((row) => row.id)).toEqual(["c", "a", "d", "b"].sort((x, y) => rows.find((r) => r.id === y)!.members - rows.find((r) => r.id === x)!.members));
    expect(first.currencies).toEqual(["INR", "USD"]);
  });

  it("ignores junk query values", () => {
    expect(parseLeaderboardQuery({ sort: "email", dir: "up", page: "-3", pageSize: "7", status: "x", currency: "<script>" })).toEqual({ sort: "active", dir: "desc", page: 1, pageSize: 20, status: "all", currency: null });
  });
});

describe("operations rollups", () => {
  const window = opsWindow("7", now);
  const key = "2026-11-20";
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const groups: OutboxGroup[] = [
    { day: at(key), kind: "payment-notice", status: "SENT", retrying: false, count: 8 },
    { day: at(key), kind: "payment-notice", status: "FAILED", retrying: false, count: 2 },
    { day: at(key), kind: "login-code", status: "PENDING", retrying: true, count: 3 },
    { day: at(key), kind: "login-code", status: "PENDING", retrying: false, count: 1 },
    { day: at("2026-11-21"), kind: "sms-code", status: "SENT", retrying: false, count: 4 },
    { day: at("2026-11-21"), kind: "chat-notice", status: "FAILED", retrying: false, count: 1 },
    { day: at("2026-01-01"), kind: "payment-notice", status: "SENT", retrying: false, count: 99 },
  ];

  it("builds the window of days", () => {
    expect(window.buckets).toHaveLength(7);
    expect(window.buckets.at(-1)?.key).toBe("2026-11-21");
    expect(opsWindow("5", now).days).toBe(30);
  });

  it("rolls the outbox up by status and kind and drops rows outside the window", () => {
    const rollup = outboxRollup(groups, window.buckets);
    expect(rollup.totals).toMatchObject({ sent: 12, failed: 3, pending: 1, retrying: 3, processing: 0, total: 19 });
    expect(rollup.byDay.find((row) => row.key === key)).toMatchObject({ sent: 8, failed: 2, retrying: 3, pending: 1 });
    expect(rollup.byKind[0]).toMatchObject({ kind: "payment-notice", failureRate: 0.2 });
    expect(ageSeconds(new Date(now.getTime() - 90_000), now)).toBe(90);
    expect(ageSeconds(null, now)).toBeNull();
  });

  it("separates emails from sms, chat and system kinds", () => {
    expect(["payment-notice", "sms-code", "chat-notice", "member-message", "member-photo-purge"].map(outboxChannel)).toEqual(["email", "sms", "chat", "member-message", "system"]);
    const email = emailRollup(groups, [{ day: at(key), reason: "BOUNCE", count: 2 }, { day: at(key), reason: "COMPLAINT", count: 1 }], 40, window.buckets);
    expect(email.totals).toMatchObject({ sent: 8 + 0, failed: 2, pending: 4, bounced: 2, complained: 1, suppressedTotal: 40 });
    expect(chatAlertRollup(groups, window.buckets).totals).toMatchObject({ failed: 1, sent: 0 });
  });

  it("rolls member messages up per channel, listing every channel", () => {
    const rollup = memberMessageRollup([
      { day: at(key), channel: "EMAIL", status: "SENT", count: 5 },
      { day: at(key), channel: "SMS", status: "FAILED", count: 1 },
      { day: at(key), channel: null, status: "PENDING", count: 2 },
    ], window.buckets);
    expect(rollup.byChannel.map((row) => row.channel)).toEqual(["EMAIL", "SMS", "WHATSAPP", "TELEGRAM", "SLACK", "DISCORD", "MATTERMOST", "NONE"]);
    expect(rollup.byChannel[0]).toMatchObject({ sent: 5, total: 5 });
    expect(rollup.totals).toMatchObject({ sent: 5, failed: 1, pending: 2, total: 8 });
  });

  it("rolls sms codes and sign-ins up as counts", () => {
    const sms = smsCodeRollup([
      { day: at(key), purpose: "SIGN_IN", outcome: "consumed", deliveryState: "delivered", count: 6 },
      { day: at(key), purpose: "SIGN_IN", outcome: "expired", deliveryState: null, count: 2 },
    ], window.buckets);
    expect(sms.totals).toMatchObject({ requested: 8, consumed: 6, expired: 2, usedRate: 0.75 });
    expect(sms.byDelivery).toEqual([{ state: "delivered", count: 6 }, { state: "unreported", count: 2 }]);
    const signIns = signInRollup([{ day: at(key), method: "password", reason: "bad_password", count: 4 }], [{ day: at(key), count: 1 }], [{ day: at(key), count: 9 }], window.buckets);
    expect(signIns.totals).toEqual({ failed: 4, blocked: 1, succeeded: 9 });
    expect(signIns.byReason).toEqual([{ method: "password", reason: "bad_password", count: 4 }]);
  });

  it("judges job heartbeats by their window", () => {
    const beat = (key: string, ageS: number | null) => ({ key, lastStartedAt: null, lastSucceededAt: ageS === null ? null : new Date(now.getTime() - ageS * 1000), lastSent: 0, lastFailed: 0, hasError: false });
    const jobs = heartbeatStatuses([beat("outbox-scheduler", 60), beat("report-rollup", 4000), beat("worker", null), beat("custom", 10)], now);
    expect(Object.fromEntries(jobs.map((job) => [job.key, job.status]))).toEqual({ "outbox-scheduler": "fresh", "report-rollup": "stale", worker: "never", custom: "unknown" });
  });
});
