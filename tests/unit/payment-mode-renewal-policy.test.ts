import { describe, expect, it } from "vitest";
import { allowsGateway, priceProblems } from "@/lib/payments/paymentMode";
import { ageOn, dobFromAnswers, parseRenewalPolicy, renewIntoApplies, yearsSince } from "@/lib/membership/renewalPolicy";
import { effectiveGraceDays } from "@/lib/membership/lapsePolicy";
import { planSchema } from "@/lib/membership/validators";
import { renewalToPayload, renewalToValues } from "@/components/plans/planRenewalState";

const base = { organisationSlug: "kunj", name: "Annual", slug: "annual", currency: "INR", durationType: "ORG_YEAR", joinMode: "OPEN" };

describe("payment modes", () => {
  it("offers the gateway only to online-or-in-hand plans", () => {
    expect(allowsGateway("ONLINE_OR_IN_HAND")).toBe(true);
    expect(allowsGateway("IN_HAND_ONLY")).toBe(false);
    expect(allowsGateway("FREE")).toBe(false);
  });

  it("requires free plans to charge nothing and paid plans to charge something", () => {
    expect(priceProblems("FREE", { priceNewMinor: 0, priceRenewalMinor: 0, joiningFeeMinor: 0 })).toEqual([]);
    expect(priceProblems("FREE", { priceNewMinor: 100, priceRenewalMinor: 0, joiningFeeMinor: 5 }).map((issue) => issue.path)).toEqual(["priceNew", "joiningFee"]);
    expect(priceProblems("IN_HAND_ONLY", { priceNewMinor: 0, priceRenewalMinor: 0, joiningFeeMinor: 0 })).toHaveLength(1);
    expect(priceProblems("ONLINE_OR_IN_HAND", { priceNewMinor: 0, priceRenewalMinor: 500, joiningFeeMinor: 0 })).toEqual([]);
  });

  it("validates the mode on the plan form and derives it when left out", () => {
    expect(planSchema.safeParse({ ...base, paymentMode: "FREE", priceNew: "10" }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, paymentMode: "IN_HAND_ONLY", priceNew: "0" }).success).toBe(false);
    expect(planSchema.parse({ ...base, paymentMode: "IN_HAND_ONLY", priceNew: "500" }).paymentMode).toBe("IN_HAND_ONLY");
    expect(planSchema.parse({ ...base }).paymentMode).toBe("FREE");
    expect(planSchema.parse({ ...base, priceNew: "500" }).paymentMode).toBe("ONLINE_OR_IN_HAND");
  });
});

describe("renewal policy", () => {
  it("falls back to the defaults and keeps what is valid", () => {
    expect(parseRenewalPolicy({})).toMatchObject({ requireApproval: false, reaskAnswers: false, eligibleGroupId: null, renewInto: null, extraGraceDays: 0 });
    expect(parseRenewalPolicy("junk").extraGraceDays).toBe(0);
    expect(parseRenewalPolicy({ requireApproval: true, extraGraceDays: 10 })).toMatchObject({ requireApproval: true, extraGraceDays: 10 });
  });

  it("reads the date of birth and works out whole years", () => {
    expect(dobFromAnswers({ dob: "2000-06-15" })).toBe("2000-06-15");
    expect(dobFromAnswers({ date_of_birth: "1999-01-02T00:00:00Z" })).toBe("1999-01-02");
    expect(dobFromAnswers({ name: "x" })).toBeNull();
    const tz = "Asia/Kolkata";
    expect(ageOn("2000-06-15", new Date("2026-06-14T06:00:00Z"), tz)).toBe(25);
    expect(ageOn("2000-06-15", new Date("2026-06-15T06:00:00Z"), tz)).toBe(26);
    expect(ageOn(null, new Date(), tz)).toBeNull();
    expect(yearsSince(new Date("2023-04-01T06:00:00Z"), new Date("2026-03-31T06:00:00Z"), tz)).toBe(2);
  });

  it("applies a renew-into rule only when every condition holds", () => {
    expect(renewIntoApplies({ ageAtLeast: 25 }, { age: 25, years: 0, inGroup: null })).toBe(true);
    expect(renewIntoApplies({ ageAtLeast: 25 }, { age: 24, years: 9, inGroup: null })).toBe(false);
    expect(renewIntoApplies({ ageAtLeast: 25 }, { age: null, years: 9, inGroup: null })).toBe(false);
    expect(renewIntoApplies({ afterYears: 3 }, { age: null, years: 3, inGroup: null })).toBe(true);
    expect(renewIntoApplies({ afterYears: 3, smartGroupId: "g" }, { age: null, years: 3, inGroup: false })).toBe(false);
  });

  it("adds the extra grace days to the plan's grace", () => {
    expect(effectiveGraceDays({ graceDays: 15 })).toBe(15);
    expect(effectiveGraceDays({ graceDays: 15, renewalPolicy: { extraGraceDays: 20 } })).toBe(35);
  });

  it("round-trips through the plan editor", () => {
    const stored = { requireApproval: true, reaskPhoto: true, extraGraceDays: 5, renewInto: { targetPlanId: "p2", when: { ageAtLeast: 25, afterYears: 2 } } };
    const values = renewalToValues(stored);
    expect(values).toMatchObject({ requireApproval: true, intoPlanId: "p2", intoAge: "25", intoYears: "2", extraGraceDays: "5" });
    expect(renewalToPayload(values)).toMatchObject(parseRenewalPolicy(stored));
    expect(renewalToPayload({ ...values, intoAge: "", intoYears: "" }).renewInto).toBeNull();
  });
});
