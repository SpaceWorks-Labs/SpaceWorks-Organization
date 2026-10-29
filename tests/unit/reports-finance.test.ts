import { describe, expect, it } from "vitest";
import { apportion, paymentHealth, revenueBy, revenueByFeeKind, revenueSeries, revenueSummary } from "@/lib/reports/finance/revenue";
import { ageingBucket, ageingTable, collectionRate, offlineQueue, outstandingItems } from "@/lib/reports/finance/outstanding";
import { forecastVsActual, paymentVolume, renewalForecast } from "@/lib/reports/finance/forecast";
import { EMPTY_FINANCE_ROWS, type FinanceRows } from "@/lib/reports/finance/types";
import { csvAmount, formatTotals, subtractTotals } from "@/lib/reports/money";
import { periodBuckets, resolvePeriod } from "@/lib/reports/period";
import { at, line, payment, refund } from "../helpers/financeFixtures";

const rows = (patch: Partial<FinanceRows>): FinanceRows => ({ ...EMPTY_FINANCE_ROWS, ...patch });
const MAY = { from: at("2026-05-01"), to: at("2026-06-01") };
const JUNE = { from: at("2026-06-01"), to: at("2026-07-01") };

describe("collected (B5)", () => {
  const data = rows({
    payments: [
      payment("a", { amountMinor: 120_000 }),
      payment("b", { currency: "USD", amountMinor: 2_500, planId: "p2" }),
      payment("c", { status: "WAIVED", paidAt: null }),
      payment("d", { status: "PENDING", paidAt: null }),
      payment("e", { paidAt: at("2026-06-05"), createdAt: at("2026-05-30") }),
    ],
    refunds: [refund("r1", "a", 20_000), refund("r2", "a", 5_000, { status: "PENDING", processedAt: null })],
  });

  it("counts PAID by paidAt only, and never adds currencies", () => {
    const may = revenueSummary(data, MAY, "INR");
    expect(may.gross).toEqual([{ currency: "INR", minor: 120_000 }, { currency: "USD", minor: 2_500 }]);
    expect(may.refunds).toEqual([]);
    expect(may.payments).toBe(2);
  });

  it("nets refunds by the date they were processed, not the payment's date", () => {
    const june = revenueSummary(data, JUNE, "INR");
    expect(june.gross).toEqual([{ currency: "INR", minor: 100_000 }]);
    expect(june.refunds).toEqual([{ currency: "INR", minor: 20_000 }]);
    expect(june.net).toEqual([{ currency: "INR", minor: 80_000 }]);
  });

  it("puts the organisation's currency first, then the rest alphabetically", () => {
    const list = subtractTotals([{ currency: "USD", minor: 5 }, { currency: "AED", minor: 1 }], [], "USD");
    expect(list.map((entry) => entry.currency)).toEqual(["USD", "AED"]);
    expect(formatTotals([{ currency: "INR", minor: 120_050 }, { currency: "USD", minor: 2_500 }])).toBe("₹1,200.50 · $25.00");
    expect(csvAmount(1_250, "OMR")).toBe("1.250");
    expect(csvAmount(500, "JPY")).toBe("500");
  });

  it("splits by plan, provider and month with refunds against their payment's group", () => {
    expect(revenueBy(data, { from: MAY.from, to: JUNE.to }, "plan", "INR").find((row) => row.key === "p1")!.totals).toEqual([{ currency: "INR", minor: 200_000 }]);
    const buckets = periodBuckets(resolvePeriod({ period: "custom", from: "2026-05-01", to: "2026-06-30" }, { timezone: "Asia/Kolkata", financialYearStartMonth: 4 }, at("2026-10-01")), "Asia/Kolkata");
    expect(revenueSeries(data, buckets, "INR").map((point) => point.net)).toEqual([[{ currency: "INR", minor: 120_000 }, { currency: "USD", minor: 2_500 }], [{ currency: "INR", minor: 80_000 }]]);
  });

  it("apportions a refund over fee kinds in whole minor units that add up exactly", () => {
    expect(apportion(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(apportion(20_000, [100_000, 20_000]).reduce((a, b) => a + b, 0)).toBe(20_000);
    const fees = revenueByFeeKind(rows({ payments: [payment("a", { amountMinor: 120_000 })], lines: [line("a", "TERM_FEE", 100_000), line("a", "JOINING_FEE", 20_000)], refunds: [refund("r", "a", 12_000, { processedAt: at("2026-05-20") })] }), MAY, "INR");
    expect(Object.fromEntries(fees.map((row) => [row.key, row.totals[0].minor]))).toEqual({ TERM_FEE: 90_000, JOINING_FEE: 18_000 });
  });

  it("reports failed online payments, waivers and pending refunds", () => {
    const health = paymentHealth(rows({ payments: [payment("a"), payment("b", { status: "FAILED", paidAt: null }), payment("c", { provider: "OFFLINE", status: "FAILED", paidAt: null }), payment("w", { status: "WAIVED", paidAt: null, amountMinor: 50_000 })], refunds: [refund("r", "a", 1, { status: "PENDING" })] }), MAY, "INR");
    expect(health).toMatchObject({ failed: 1, onlineAttempts: 2, failedRate: 0.5, waived: 1, waivedTotals: [{ currency: "INR", minor: 50_000 }], pendingRefunds: 1 });
  });
});

describe("outstanding (B9) and offline queue (B8)", () => {
  const now = at("2026-10-20");
  const data = rows({
    payments: [
      payment("p1", { status: "PENDING", paidAt: null, createdAt: at("2026-10-10") }),
      payment("p2", { status: "AWAITING_CONFIRMATION", provider: "OFFLINE", paidAt: null, createdAt: at("2026-06-01"), amountMinor: 50_000 }),
      payment("p3", { provider: "OFFLINE", paidAt: at("2026-05-03"), createdAt: at("2026-05-01"), recordedById: "u1", confirmedById: "u2" }),
      payment("p4", { provider: "OFFLINE", paidAt: at("2026-05-02"), createdAt: at("2026-05-01"), recordedById: "u1", confirmedById: "u1", flagged: true }),
    ],
    unpaidTerms: [{ termId: "t1", memberId: "m2", planId: "p1", unitId: null, currency: "USD", amountMinor: 2_500, createdAt: at("2026-10-01"), paymentDueBy: at("2026-11-01") }],
  });

  it("includes unpaid payments, offline claims and unpaid terms, aged by days past due", () => {
    const items = outstandingItems(data, now);
    expect(items.map((item) => [item.id, item.bucket])).toEqual([["p2", "90+"], ["p1", "0-30"], ["t1", "current"]]);
    expect(ageingBucket(30)).toBe("0-30");
    expect(ageingBucket(31)).toBe("31-60");
    expect(ageingBucket(91)).toBe("90+");
    const table = ageingTable(items, "INR");
    expect(table.find((row) => row.key === "current")!.totals).toEqual([{ currency: "USD", minor: 2_500 }]);
  });

  it("measures the collection rate per currency over charges raised in the window", () => {
    expect(collectionRate(data, MAY, "INR")).toEqual([{ currency: "INR", raised: 200_000, paid: 200_000, rate: 1 }]);
    expect(collectionRate(data, { from: at("2026-10-01"), to: at("2026-11-01") }, "INR")).toEqual([{ currency: "INR", raised: 100_000, paid: 0, rate: 0 }, { currency: "USD", raised: 2_500, paid: 0, rate: 0 }]);
  });

  it("tracks maker-checker: who confirmed offline payments, and how fast", () => {
    const queue = offlineQueue(data, MAY, "INR");
    expect(queue.awaiting.map((p) => p.id)).toEqual(["p2"]);
    expect(queue.flagged.map((p) => p.id)).toEqual(["p4"]);
    expect([queue.confirmed, queue.checkedByAnother, queue.selfConfirmed]).toEqual([2, 1, 1]);
    expect(queue.medianHoursToConfirm).toBe(36);
  });
});

describe("forecast, platform volume and member payments", () => {
  const plans = [{ id: "p1", name: "Annual", currency: "INR", priceRenewalMinor: 100_000 }, { id: "free", name: "Free", currency: "INR", priceRenewalMinor: 0 }];
  const terms = [
    { id: "a", planId: "p1", memberId: "m1", endsAt: at("2026-11-01"), renewed: false, active: true, renewedFromId: null },
    { id: "b", planId: "p1", memberId: "m2", endsAt: at("2026-12-15"), renewed: true, active: true, renewedFromId: null },
    { id: "c", planId: "free", memberId: "m3", endsAt: at("2026-11-05"), renewed: false, active: true, renewedFromId: null },
    { id: "d", planId: "p1", memberId: "m4", endsAt: at("2026-12-01"), renewed: false, active: true, renewedFromId: null },
  ];

  it("prices renewals ahead at the renewal price and applies the renewal rate", () => {
    const [d30, d60] = renewalForecast(terms, plans, at("2026-10-20"), 0.75, "INR", [30, 60]);
    expect(d30).toMatchObject({ terms: 2, atStake: [{ currency: "INR", minor: 100_000 }], expected: [{ currency: "INR", minor: 75_000 }] });
    expect(d60.atStake).toEqual([{ currency: "INR", minor: 200_000 }]);
  });

  it("compares renewal value due with money collected for those renewals", () => {
    const buckets = periodBuckets(resolvePeriod({ period: "custom", from: "2026-11-01", to: "2026-11-30" }, { timezone: "Asia/Kolkata", financialYearStartMonth: 4 }, at("2027-01-01")), "Asia/Kolkata", "month");
    const result = forecastVsActual([...terms, { id: "a2", planId: "p1", memberId: "m1", endsAt: at("2027-11-01"), renewed: false, active: false, renewedFromId: "a" }], plans, rows({ payments: [payment("x", { termId: "a2", amountMinor: 100_000 })] }), buckets, "INR");
    expect(result[0]).toMatchObject({ due: [{ currency: "INR", minor: 100_000 }], actual: [{ currency: "INR", minor: 100_000 }] });
  });

  it("sums platform volume per currency without converting", () => {
    const volume = paymentVolume([{ ...payment("a"), organisationId: "o1" }, { ...payment("b", { provider: "OFFLINE" }), organisationId: "o2" }, { ...payment("c", { currency: "USD", amountMinor: 900 }), organisationId: "o1" }], MAY);
    expect(volume).toEqual([
      { currency: "INR", payments: 2, minor: 200_000, organisations: 2, byProvider: { RAZORPAY: 100_000, STRIPE: 0, OFFLINE: 100_000 } },
      { currency: "USD", payments: 1, minor: 900, organisations: 1, byProvider: { RAZORPAY: 900, STRIPE: 0, OFFLINE: 0 } },
    ]);
  });
});
