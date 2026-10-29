import { describe, expect, it } from "vitest";
import { walletState, type WalletPlan, type WalletTerm } from "@/lib/portal/walletStatus";
import { historyCause, historyLine } from "@/lib/portal/history";

const TZ = "Asia/Kolkata";
const at = (iso: string) => new Date(iso);
const plan: WalletPlan = { durationType: "ORG_YEAR", renewalWindowDays: 30, joinMode: "APPROVAL", archivedAt: null, fixedEndDate: null, lateRenewalBackdate: true };
const args = (now: string, organisationActive = true) => ({ now: at(now), timeZone: TZ, organisationActive });

/** A financial-year term: 1 Apr 2026 to 31 Mar 2027 (IST), with 15 days' grace. */
function year(id: string, overrides: Partial<WalletTerm> = {}): WalletTerm {
  return {
    id, kind: "NEW", status: "ACTIVE",
    startsAt: at("2026-03-31T18:30:00Z"), endsAt: at("2027-03-31T18:30:00Z"), graceUntil: at("2027-04-15T18:30:00Z"),
    paymentDueBy: null, renewedFromId: null, createdAt: at("2026-03-20T00:00:00Z"),
    ...overrides,
  };
}

describe("wallet status mapping", () => {
  it("shows an active membership, its last valid day and when renewal opens", () => {
    const state = walletState([year("t1")], plan, args("2026-10-20T06:00:00Z"));
    expect(state.status).toBe("ACTIVE");
    expect(state.validUntil).toEqual({ year: 2027, month: 3, day: 31 });
    expect(state.daysLeft).toBe(163);
    expect(state.renewalOpensAt?.toISOString()).toBe("2027-03-01T18:30:00.000Z");
    expect(state.actions).toEqual({ renew: false, rejoin: false, payTermId: null, withdrawTermId: null, withdrawKind: null, leave: true });
  });

  it("offers Renew inside the window and during grace, never for lifetime plans", () => {
    expect(walletState([year("t1")], plan, args("2027-03-10T06:00:00Z")).actions.renew).toBe(true);
    const grace = walletState([year("t1")], plan, args("2027-04-05T06:00:00Z"));
    expect(grace.status).toBe("GRACE");
    expect(grace.daysLeft).toBe(11);
    expect(grace.actions.renew).toBe(true);
    const lifetime = walletState([year("t1", { endsAt: null, graceUntil: null })], { ...plan, durationType: "LIFETIME" }, args("2027-03-10T06:00:00Z"));
    expect(lifetime.validUntil).toBeNull();
    expect(lifetime.actions.renew).toBe(false);
  });

  it("points an unpaid renewal at the pay page and lets the member cancel it", () => {
    const renewal = year("t2", { kind: "RENEWAL", status: "PENDING_PAYMENT", startsAt: null, endsAt: null, graceUntil: null, renewedFromId: "t1", paymentDueBy: at("2027-03-24T00:00:00Z"), createdAt: at("2027-03-10T06:00:00Z") });
    const state = walletState([year("t1"), renewal], plan, args("2027-03-12T06:00:00Z"));
    expect(state.status).toBe("ACTIVE");
    expect(state.actions).toMatchObject({ renew: false, payTermId: "t2", withdrawTermId: "t2", withdrawKind: "renewal", leave: true });
    // Once the payment window passes, the unpaid term expires and Renew comes back.
    const later = walletState([year("t1"), renewal], plan, args("2027-03-25T06:00:00Z"));
    expect(later.actions).toMatchObject({ renew: true, payTermId: null, withdrawTermId: null });
  });

  it("shows a paid early renewal as renewed until next year", () => {
    const upcoming = year("t2", { kind: "RENEWAL", status: "UPCOMING", startsAt: at("2027-03-31T18:30:00Z"), endsAt: at("2028-03-31T18:30:00Z"), graceUntil: at("2028-04-15T18:30:00Z"), renewedFromId: "t1", createdAt: at("2027-03-10T06:00:00Z") });
    const state = walletState([year("t1"), upcoming], plan, args("2027-03-20T06:00:00Z"));
    expect(state.status).toBe("ACTIVE");
    expect(state.renewedUntil).toEqual({ year: 2028, month: 3, day: 31 });
    expect(state.actions).toMatchObject({ renew: false, withdrawTermId: "t2", withdrawKind: "renewal" });
  });

  it("waits on an application and lets the member withdraw it", () => {
    const applied = year("t1", { status: "PENDING_APPROVAL", startsAt: null, endsAt: null, graceUntil: null });
    const state = walletState([applied], plan, args("2026-04-02T06:00:00Z"));
    expect(state.status).toBe("PENDING_APPROVAL");
    expect(state.validUntil).toBeNull();
    expect(state.actions).toEqual({ renew: false, rejoin: false, payTermId: null, withdrawTermId: "t1", withdrawKind: "application", leave: false });
  });

  it("offers Rejoin after a lapse on open plans only, and nothing while the organisation is paused", () => {
    const lapsed = walletState([year("t1")], plan, args("2027-05-01T06:00:00Z"));
    expect(lapsed.status).toBe("LAPSED");
    expect(lapsed.actions).toMatchObject({ renew: false, rejoin: true, leave: false });
    expect(walletState([year("t1")], { ...plan, joinMode: "INVITE_ONLY" }, args("2027-05-01T06:00:00Z")).actions.rejoin).toBe(false);
    expect(walletState([year("t1")], plan, args("2027-03-10T06:00:00Z", false)).actions.renew).toBe(false);
    expect(walletState([year("t1")], { ...plan, archivedAt: at("2027-01-01T00:00:00Z") }, args("2027-03-10T06:00:00Z")).actions.renew).toBe(false);
  });

  it("offers nothing on revoked memberships", () => {
    const state = walletState([year("t1", { status: "REVOKED" })], plan, args("2026-10-20T06:00:00Z"));
    expect(state.status).toBe("REVOKED");
    expect(Object.values(state.actions).filter(Boolean)).toEqual([]);
  });

  it("words history events for members", () => {
    expect(historyLine({ to: "ACTIVE", cause: "paid" })).toBe("Active · Payment received");
    expect(historyCause("withdraw")).toBe("Called off");
    expect(historyCause("some-new-cause")).toBe("Some new cause");
  });
});
