import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

process.env.AUTH_SECRET ??= "integration-secret-integration-secret-42";
process.env.PAYMENT_SECRETS_KEY ??= randomBytes(32).toString("base64");

const { prisma } = await import("@/lib/db");
const { queueClaimReminders, queueLifecycleReminders, queueReminderDigests } = await import("@/lib/membership/sweepReminders");

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const DAY = 86_400_000;
const now = new Date("2026-11-19T06:00:00Z");
let orgId: string;
let planId: string;
let memberId: string;
const outbox = (key: string) => prisma.outboxMessage.findMany({ where: { kind: "member-message", payload: { path: ["dedupeKey"], string_contains: key } } });

let counter = 1;
/** Each term gets its own member: one member cannot hold overlapping terms on a plan. */
async function term(status: "GRACE" | "LAPSED", endsAt: Date, graceUntil: Date) {
  counter += 1;
  const owner = await prisma.member.create({ data: { organisationId: orgId, email: `m${counter}-${suffix}@example.test`, name: "Member " + counter, memberNumber: counter } });
  memberId = owner.id;
  return prisma.membershipTerm.create({ data: { organisationId: orgId, memberId: owner.id, planId, status, startsAt: new Date(endsAt.getTime() - 365 * DAY), endsAt, graceUntil, currency: "INR", priceMinor: 100_000 } });
}

beforeAll(async () => {
  const org = await prisma.organisation.create({ data: { name: "Kunj", slug: `kunj-${suffix}`, status: "ACTIVE", timezone: "Asia/Kolkata" } });
  orgId = org.id;
  planId = (await prisma.membershipPlan.create({ data: { organisationId: orgId, name: "Annual", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 100_000, priceRenewalMinor: 100_000, joinMode: "OPEN" } })).id;
  memberId = (await prisma.member.create({ data: { organisationId: orgId, email: `m-${suffix}@example.test`, name: "Asha Menon", memberNumber: 1 } })).id;
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${orgId}`;
  await prisma.organisation.delete({ where: { id: orgId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe.sequential("lifecycle reminders", () => {
  it("sends grace started once per term, however often the sweep runs", async () => {
    const grace = await term("GRACE", new Date(now.getTime() - 2 * DAY), new Date(now.getTime() + 20 * DAY));
    await queueLifecycleReminders(now);
    await queueLifecycleReminders(now);
    const rows = await outbox(`reminder:${grace.id}:grace-started`);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ kind: "grace-started", memberId });
    expect((await prisma.reminderLog.findMany({ where: { termId: grace.id } })).map((log) => log.key)).toEqual(["grace-started"]);
    // Only the wording's values travel: no email address in the row.
    expect(JSON.stringify(rows[0].payload)).not.toContain("example.test");
  });

  it("sends grace ending in the last days of the grace period, and lapsed once it is over", async () => {
    const ending = await term("GRACE", new Date(now.getTime() - 27 * DAY), new Date(now.getTime() + 2 * DAY));
    const lapsed = await term("LAPSED", new Date(now.getTime() - 12 * DAY), new Date(now.getTime() - 1 * DAY));
    await queueLifecycleReminders(now);
    await queueLifecycleReminders(now);
    expect(await outbox(`reminder:${ending.id}:grace-ending`)).toHaveLength(1);
    expect(await outbox(`reminder:${lapsed.id}:lapsed`)).toHaveLength(1);
    expect(await outbox(`reminder:${lapsed.id}:grace-started`)).toHaveLength(0);
  });

  it("tells a member their claim is still being checked after a day, once, and alerts the team", async () => {
    const pending = await term("GRACE", new Date(now.getTime() + 5 * DAY), new Date(now.getTime() + 30 * DAY));
    const payment = await prisma.payment.create({ data: { organisationId: orgId, memberId, termId: pending.id, provider: "OFFLINE", status: "AWAITING_CONFIRMATION", memberClaim: true, amountMinor: 100_000, currency: "INR", taxSnapshot: {}, createdAt: new Date(now.getTime() - 30 * 3_600_000) } as never });
    await prisma.chatChannel.create({ data: { organisationId: orgId, kind: "SLACK", name: "Team", target: "x", events: ["payment-to-confirm", "reminders-digest"], configEncrypted: "v1.x.y.z" } });
    await queueClaimReminders(now);
    await queueClaimReminders(now);
    expect(await outbox(`reminder:${pending.id}:claim-${payment.id}`)).toHaveLength(1);
    expect(await prisma.outboxMessage.count({ where: { kind: "chat-notice", payload: { path: ["event"], equals: "payment-to-confirm" } } })).toBeGreaterThanOrEqual(1);
  });

  it("queues the digest for chat destinations once a day, after eight in the organisation's morning", async () => {
    const early = new Date("2026-11-19T01:00:00Z"); // 06:30 in India
    expect((await queueReminderDigests(early)).queuedDigests).toBe(0);
    expect((await queueReminderDigests(now)).queuedDigests).toBe(1); // 11:30 in India
    expect((await queueReminderDigests(now)).queuedDigests).toBe(0);
  });
});
