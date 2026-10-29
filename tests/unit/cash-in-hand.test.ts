import { describe, expect, it } from "vitest";
import { cashInHand, staffCollected, type OfflineCollection } from "@/lib/reports/finance/cashInHand";

const window = { from: new Date("2026-04-01T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z") };
let next = 0;
function row(patch: Partial<OfflineCollection>): OfflineCollection {
  next += 1;
  return { id: `p${next}`, memberId: `m${next}`, unitId: "north-1", memberClaim: false, recordedById: "collector-a", status: "PAID", currency: "INR", amountMinor: 50_000, refundedMinor: 0, createdAt: new Date("2026-06-01T00:00:00Z"), ...patch };
}

describe("cash in hand", () => {
  it("tells staff collection from a member's own claim", () => {
    expect(staffCollected({ memberClaim: false })).toBe(true);
    expect(staffCollected({ memberClaim: true })).toBe(false);
  });

  it("sums per collector and per unit, net of refunds, per currency", () => {
    const rows = [
      row({ amountMinor: 50_000, createdAt: new Date("2026-05-10T00:00:00Z") }),
      row({ amountMinor: 30_000, refundedMinor: 10_000 }),
      row({ amountMinor: 2_000, currency: "USD" }),
      row({ recordedById: "collector-b", unitId: "north-2", amountMinor: 40_000, status: "AWAITING_CONFIRMATION", createdAt: new Date("2026-07-01T00:00:00Z") }),
      row({ recordedById: "member-user", memberClaim: true, amountMinor: 99_000 }),
      row({ amountMinor: 70_000, createdAt: new Date("2026-03-31T23:59:59Z") }),
    ];
    const report = cashInHand(rows, window, "INR");
    expect(report.payments).toBe(4);
    expect(report.held).toEqual([{ currency: "INR", minor: 110_000 }, { currency: "USD", minor: 2_000 }]);
    expect(report.awaiting).toEqual([{ currency: "INR", minor: 40_000 }]);
    const [a, b] = report.byCollector;
    expect(a).toMatchObject({ key: "collector-a", payments: 3, held: [{ currency: "INR", minor: 70_000 }, { currency: "USD", minor: 2_000 }], awaiting: [] });
    expect(a.oldest).toEqual(new Date("2026-05-10T00:00:00Z"));
    expect(b).toMatchObject({ key: "collector-b", held: [{ currency: "INR", minor: 40_000 }], awaiting: [{ currency: "INR", minor: 40_000 }] });
    expect(report.byUnit.map((group) => group.key)).toEqual(["north-1", "north-2"]);
  });

  it("groups members without a unit together and is empty for an empty window", () => {
    expect(cashInHand([row({ unitId: null })], window, "INR").byUnit[0].key).toBe("none");
    expect(cashInHand([row({})], { from: window.to, to: new Date("2027-01-01T00:00:00Z") }, "INR")).toMatchObject({ payments: 0, held: [], byCollector: [] });
  });
});
