import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifiedEmail: vi.fn(), memberFindMany: vi.fn(), logFindMany: vi.fn() }));

vi.mock("@/lib/portal/member", () => ({ PORTAL_ORGANISATION_STATUSES: ["ACTIVE", "SUSPENDED", "ARCHIVED"], verifiedEmail: mocks.verifiedEmail }));
vi.mock("@/lib/db", () => ({ prisma: { member: { findMany: mocks.memberFindMany }, memberMessageLog: { findMany: mocks.logFindMany } } }));

import { loadOwnMessages, MESSAGE_HISTORY_LIMIT } from "@/lib/notify/history";

beforeEach(() => vi.clearAllMocks());

describe("account message history", () => {
  it("shows nothing without a verified email", async () => {
    mocks.verifiedEmail.mockResolvedValue(null);
    expect(await loadOwnMessages("u1")).toEqual([]);
    expect(mocks.memberFindMany).not.toHaveBeenCalled();
    expect(mocks.logFindMany).not.toHaveBeenCalled();
  });

  it("finds records by the verified email, leaving out erased records and organisations with the portal off", async () => {
    mocks.verifiedEmail.mockResolvedValue("me@example.org");
    mocks.memberFindMany.mockResolvedValue([]);
    await loadOwnMessages("u1");
    const where = mocks.memberFindMany.mock.calls[0][0].where;
    expect(where.email).toBe("me@example.org");
    expect(where.anonymisedAt).toBeNull();
    expect(where.organisation.memberPortal).toBe(true);
    expect(mocks.logFindMany).not.toHaveBeenCalled();
  });

  it("reads only this person's own member records, newest 30, without any message body", async () => {
    mocks.verifiedEmail.mockResolvedValue("me@example.org");
    mocks.memberFindMany.mockResolvedValue([{ id: "m1", organisationId: "o1", organisation: { name: "Club" } }, { id: "m2", organisationId: "o2", organisation: { name: "Guild" } }]);
    mocks.logFindMany.mockResolvedValue([
      { id: "l1", organisationId: "o1", kind: "renewal-due", status: "SENT", channel: "EMAIL", createdAt: new Date("2026-03-01T10:00:00Z") },
      { id: "l2", organisationId: "o2", kind: "mystery", status: "PENDING", channel: null, createdAt: new Date("2026-02-01T10:00:00Z") },
      { id: "l3", organisationId: "o1", kind: "lapsed", status: "FAILED", channel: "SMS", createdAt: new Date("2026-01-01T10:00:00Z") },
    ]);
    const messages = await loadOwnMessages("u1");
    const args = mocks.logFindMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([{ organisationId: "o1", memberId: "m1" }, { organisationId: "o2", memberId: "m2" }]);
    expect(args.take).toBe(MESSAGE_HISTORY_LIMIT);
    expect(Object.keys(args.select).sort()).toEqual(["channel", "createdAt", "id", "kind", "organisationId", "status"]);
    expect(messages.map((message) => [message.kind, message.organisation, message.channel, message.status])).toEqual([
      ["Renewal due", "Club", "Email", "Sent"],
      ["Message", "Guild", null, "Waiting"],
      ["Membership lapsed", "Club", "Text message", "Failed"],
    ]);
  });
});
