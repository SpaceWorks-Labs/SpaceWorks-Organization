import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; organisationId: string; action: string; actorUserId: string | null; targetType: string | null; targetId: string | null; metadata: unknown; createdAt: Date };

const state = vi.hoisted(() => ({ events: [] as Row[], inReach: new Set<string>(), calls: [] as unknown[] }));

vi.mock("@/lib/db", () => ({
  prisma: {
    auditEvent: {
      findMany: vi.fn(async (args: { where: { AND: Array<Record<string, unknown>> }; take: number }) => {
        state.calls.push(args.where);
        const organisationId = (args.where.AND.find((part) => "organisationId" in part) as { organisationId: string }).organisationId;
        const cursorPart = args.where.AND.find((part) => "OR" in part && Array.isArray(part.OR) && part.OR.some((entry: Record<string, unknown>) => "createdAt" in entry && typeof entry.createdAt === "object" && "lt" in (entry.createdAt as object))) as { OR: Array<{ createdAt: { lt: Date } | Date; id?: { lt: string } }> } | undefined;
        const before = cursorPart ? (cursorPart.OR[0].createdAt as { lt: Date }).lt : null;
        return state.events
          .filter((row) => row.organisationId === organisationId && (!before || row.createdAt < before))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, args.take);
      }),
    },
    member: {
      findMany: vi.fn(async (args: { where: { AND: Array<{ id?: { in: string[] } }> } }) => (args.where.AND.find((part) => part.id)!.id!.in.filter((id) => state.inReach.has(id)).map((id) => ({ id })))),
      count: vi.fn(async (args: { where: { AND: Array<{ id?: string }> } }) => (state.inReach.has(args.where.AND.find((part) => part.id)!.id!) ? 1 : 0)),
    },
    teamMember: { findMany: vi.fn(async () => [{ userId: "staff" }]), count: vi.fn(async () => 1) },
    membershipTerm: { findMany: vi.fn(async () => []) },
    memberCard: { findMany: vi.fn(async () => []) },
    payment: { findMany: vi.fn(async () => []) },
    erasureRequest: { findMany: vi.fn(async () => []) },
    consentRecord: { findMany: vi.fn(async () => []) },
    refundRequest: { findMany: vi.fn(async () => []) },
  },
}));

import { decodeCursor, encodeCursor, loadActivityLog, LOG_PAGE_SIZE } from "@/lib/audit/log";
import { activityCategory, isAccountSecurityAction, isMemberInitiatedAction } from "@/lib/reports/activity";
import { targetHref } from "@/lib/audit/targets";

const wholeOrg = { organisationId: "org1", unitId: null, unitPath: null, limits: [] };
const limitedScope = { organisationId: "org1", unitId: "u1", unitPath: "u1", limits: [] };

let counter = 0;
const event = (patch: Partial<Row>): Row => {
  counter += 1;
  return { id: `e${String(counter).padStart(4, "0")}`, organisationId: "org1", action: "MEMBER_UPDATED", actorUserId: "staff", targetType: "Member", targetId: "m1", metadata: null, createdAt: new Date(2026, 0, 1, 0, counter), ...patch };
};

beforeEach(() => {
  counter = 0;
  state.events = [];
  state.calls = [];
  state.inReach = new Set(["m1"]);
});

describe("activity log scope", () => {
  it("never returns another organisation's events", async () => {
    state.events = [event({}), event({ organisationId: "org2" })];
    const page = await loadActivityLog("org1", wholeOrg, {});
    expect(page.events).toHaveLength(1);
    expect(page.events.every((row) => state.events.find((source) => source.id === row.id)!.organisationId === "org1")).toBe(true);
  });

  it("shows limited staff only events about members in their reach, including terms they own via metadata", async () => {
    state.events = [
      event({ targetId: "m1" }),
      event({ targetId: "m2" }),
      event({ targetType: "MembershipTerm", targetId: "t9", metadata: { memberId: "m1" } }),
      event({ targetType: "MembershipTerm", targetId: "t8", metadata: { memberId: "m2" } }),
      event({ action: "PLAN_UPDATED", targetType: "MembershipPlan", targetId: "p1" }),
    ];
    const page = await loadActivityLog("org1", limitedScope, {});
    expect(page.events.map((row) => row.memberId)).toEqual(["m1", "m1"]);
  });

  it("lets whole-organisation staff see organisation-level events too", async () => {
    state.events = [event({ action: "PLAN_UPDATED", targetType: "MembershipPlan", targetId: "p1" })];
    expect((await loadActivityLog("org1", wholeOrg, {})).events).toHaveLength(1);
  });

  it("answers nothing when limited staff ask about a member outside their reach", async () => {
    state.events = [event({ targetId: "m2" })];
    expect(await loadActivityLog("org1", limitedScope, { memberId: "m2" })).toEqual({ events: [], next: null });
  });

  it("leaves a person's account security out of the log", async () => {
    state.events = [event({ action: "PASSKEY_ADDED", targetType: "Passkey", targetId: "k1" }), event({ action: "SIGN_IN_FAILED" }), event({ action: "MEMBER_UPDATED" })];
    const page = await loadActivityLog("org1", wholeOrg, {});
    expect(page.events.map((row) => row.action)).toEqual(["MEMBER_UPDATED"]);
  });
});

describe("activity log filters and pages", () => {
  it("filters by category, keeping member-initiated and system events", async () => {
    state.events = [
      event({ action: "CARD_ISSUED", targetType: "MemberCard", targetId: "c1", metadata: { memberId: "m1" } }),
      event({ action: "MEMBERSHIP_RENEWED_BY_MEMBER", actorUserId: "someone", targetType: "MembershipTerm", targetId: "t1" }),
      event({ action: "RENEWAL_REMINDERS_SENT", actorUserId: null, targetType: "Organisation", targetId: "org1" }),
    ];
    expect((await loadActivityLog("org1", wholeOrg, { category: "cards" })).events.map((row) => row.action)).toEqual(["CARD_ISSUED"]);
    expect((await loadActivityLog("org1", wholeOrg, { category: "memberships" })).events.map((row) => row.action)).toEqual(["MEMBERSHIP_RENEWED_BY_MEMBER"]);
    expect((await loadActivityLog("org1", wholeOrg, { category: "reminders" })).events[0].actorUserId).toBeNull();
  });

  it("passes the actor, date range and member filters to the query", async () => {
    state.events = [event({})];
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 0, 2);
    await loadActivityLog("org1", wholeOrg, { actor: "system", from, to });
    const where = JSON.stringify(state.calls[0]);
    expect(where).toContain('"actorUserId":null');
    expect(where).toContain('"gte"');
    expect(where).toContain('"lt"');
    state.calls = [];
    await loadActivityLog("org1", wholeOrg, { memberId: "m1" });
    expect(JSON.stringify(state.calls[0])).toContain('"memberId"');
  });

  it("pages 50 at a time with a cursor that continues without repeats", async () => {
    state.events = Array.from({ length: 120 }, () => event({}));
    const first = await loadActivityLog("org1", wholeOrg, {});
    expect(first.events).toHaveLength(LOG_PAGE_SIZE);
    expect(first.next).not.toBeNull();
    const second = await loadActivityLog("org1", wholeOrg, { cursor: first.next! });
    expect(second.events).toHaveLength(LOG_PAGE_SIZE);
    const third = await loadActivityLog("org1", wholeOrg, { cursor: second.next! });
    expect(third.events).toHaveLength(20);
    expect(third.next).toBeNull();
    const ids = [...first.events, ...second.events, ...third.events].map((row) => row.id);
    expect(new Set(ids).size).toBe(120);
  });

  it("round-trips cursors and ignores malformed ones", () => {
    const at = new Date(2026, 3, 1);
    expect(decodeCursor(encodeCursor({ createdAt: at, id: "abc123" }))).toEqual({ at, id: "abc123" });
    expect(decodeCursor("nonsense")).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });
});

describe("activity categories and targets", () => {
  it("classifies the new families and member renewals", () => {
    expect(activityCategory("CARD_ISSUED")).toBe("cards");
    expect(activityCategory("CONSENT_WITHDRAWN")).toBe("messaging");
    expect(activityCategory("MESSAGING_POLICY_UPDATED")).toBe("messaging");
    expect(activityCategory("LEDGER_ENTRY_VOIDED")).toBe("ledger");
    expect(activityCategory("MEMBER_ANSWERS_UPDATED")).toBe("members");
    expect(activityCategory("SMART_GROUP_DELETED")).toBe("groupings");
    expect(activityCategory("GROUPING_VALUE_ARCHIVED")).toBe("groupings");
    expect(activityCategory("ERASURE_REQUESTED")).toBe("erasure");
    expect(activityCategory("MEMBERSHIP_RENEWED_BY_MEMBER")).toBe("memberships");
    expect(activityCategory("MEMBER_ROLE_CREATED")).toBe("setup");
    expect(activityCategory("PAYMENT_GATEWAY_SAVED")).toBe("setup");
    expect(activityCategory("PAYMENT_PAID")).toBe("money");
    expect(activityCategory("PASSKEY_ADDED")).toBe("account");
    expect(isAccountSecurityAction("PHONE_REMOVED")).toBe(true);
    expect(isAccountSecurityAction("SESSION_REVOKED")).toBe(true);
    expect(isMemberInitiatedAction("MEMBERSHIP_RENEWED_BY_MEMBER")).toBe(true);
    expect(isMemberInitiatedAction("MEMBER_UPDATED")).toBe(false);
  });

  it("links targets to their pages and refuses unsafe ids", () => {
    expect(targetHref("club", "Member", "m1")).toBe("/dashboard/club/members/m1");
    expect(targetHref("club", "Payment", "p1")).toBe("/dashboard/club/payments/p1");
    expect(targetHref("club", "MemberCard", "c1", { memberId: "m1" })).toBe("/dashboard/club/members/m1");
    expect(targetHref("club", "MemberCard", "c1")).toBeNull();
    expect(targetHref("club", "OrgUnit", "u1")).toBe("/dashboard/club/settings/structure/u1");
    expect(targetHref("club", "MembershipPlan", "pl1")).toBe("/dashboard/club/plans/pl1");
    expect(targetHref("club", "SmartGroup", "s1")).toBe("/dashboard/club/members?sg=s1");
    expect(targetHref("club", "OrgGroupingValue", "v1")).toBe("/dashboard/club/members?gv=v1");
    expect(targetHref("club", "RefundRequest", "r1", { paymentId: "p2" })).toBe("/dashboard/club/payments/p2");
    expect(targetHref("club", "Member", "../x")).toBeNull();
    expect(targetHref("bad/slug", "Member", "m1")).toBeNull();
    expect(targetHref("club", "Organisation", "o1")).toBeNull();
    expect(targetHref("club", null, null)).toBeNull();
  });
});
