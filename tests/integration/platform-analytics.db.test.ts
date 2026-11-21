import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: async () => true, getRedisClient: () => null }));

import { prisma } from "@/lib/db";
import { openTerm, upsertMember } from "@/lib/membership/service";
import { localDate } from "@/lib/membership/periods";
import { recomputeOrgDays } from "@/lib/reports/rollup";
import { loadSuperAdminGrowthView, loadSuperAdminMoneyView } from "@/lib/views/app__super-admin__analytics__growth";
import { loadSuperAdminLeaderboardView } from "@/lib/views/app__super-admin__analytics__leaderboard";
import { loadSuperAdminOperationsHealthView } from "@/lib/views/app__super-admin__analytics__health";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const now = new Date();
const DAY = 86_400_000;
const ids: Record<string, string> = {};
const orgs: Array<{ id: string; slug: string; timezone: string; financialYearStartMonth: number; createdAt: Date }> = [];
const params = (extra: Record<string, string> = {}) => Promise.resolve({ range: "30d", ...extra });

const SECRET_NAME = `Quentin Zorander ${suffix}`;
const SECRET_EMAIL = `payload-person-${suffix}@example.test`;
const SECRET_PHONE = "+91 98470 55555";
const SECRET_IP = "203.0.113.77";
const SECRET_ERROR = `smtp password rejected for ${SECRET_EMAIL}`;

type Snapshot = { growth: Awaited<ReturnType<typeof loadSuperAdminGrowthView>>; money: Awaited<ReturnType<typeof loadSuperAdminMoneyView>>; health: Awaited<ReturnType<typeof loadSuperAdminOperationsHealthView>> };
const load = async (): Promise<Snapshot> => ({
  growth: await loadSuperAdminGrowthView({ searchParams: params() }),
  money: await loadSuperAdminMoneyView({ searchParams: params() }),
  health: await loadSuperAdminOperationsHealthView({ searchParams: Promise.resolve({ days: "7" }) }),
});
let before: Snapshot;

async function user(name: string, extra: { isSuperAdmin?: boolean } = {}) {
  return prisma.user.create({ data: { email: `${name}-${suffix}@example.test`, name, emailVerified: new Date(), mfaEnabledAt: new Date(), ...extra } });
}

beforeAll(async () => {
  const admin = await user("platform", { isSuperAdmin: true });
  const plain = await user("plain");
  Object.assign(ids, { admin: admin.id, plain: plain.id });
  mocks.userId = admin.id;
  before = await load();

  for (const [key, currency, price] of [["a", "INR", 50_000], ["b", "USD", 2_000]] as const) {
    const org = await prisma.organisation.create({ data: { name: `Example ${key.toUpperCase()} ${suffix}`, slug: `example-${key}-${suffix}`, status: "ACTIVE", createdAt: new Date(now.getTime() - 3 * DAY) } });
    orgs.push({ id: org.id, slug: org.slug, timezone: org.timezone, financialYearStartMonth: org.financialYearStartMonth, createdAt: org.createdAt });
    const paid = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Paid", slug: `paid-${key}-${suffix}`, currency, priceNewMinor: price, joinMode: "OPEN", durationType: "ORG_YEAR" } });
    const count = key === "a" ? 3 : 1;
    for (let index = 0; index < count; index += 1) {
      const member = await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `m${index}-${key}-${suffix}@example.test`, name: index === 0 && key === "a" ? SECRET_NAME : `Member ${index} ${key}`, source: "MANUAL", phone: SECRET_PHONE }));
      const term = await prisma.$transaction((tx) => openTerm(tx, { org: orgs.at(-1)!, plan: paid, memberId: member.id, byManager: true, actorUserId: null, now: new Date(now.getTime() - 2 * DAY) }));
      ids[`${key}${index}`] = member.id;
      ids[`${key}${index}term`] = term.id;
    }
    if (key === "a") {
      const free = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Free", slug: `free-${suffix}`, currency, priceNewMinor: 0, joinMode: "OPEN", durationType: "ORG_YEAR" } });
      const member = await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: `free-${suffix}@example.test`, name: "Free Member", source: "MANUAL" }));
      await prisma.$transaction((tx) => openTerm(tx, { org: orgs.at(-1)!, plan: free, memberId: member.id, byManager: true, actorUserId: null, now: new Date(now.getTime() - 2 * DAY) }));
    }
    await recomputeOrgDays(org.id, [localDate(new Date(now.getTime() - 2 * DAY), org.timezone), localDate(now, org.timezone)], now);
  }
  const [a, b] = orgs;
  const pay = (organisationId: string, memberId: string, termId: string, provider: "RAZORPAY" | "OFFLINE" | "STRIPE", currency: string, amountMinor: number) =>
    prisma.payment.create({ data: { organisationId, memberId, termId, provider, status: "PAID", currency, amountMinor, paidAt: new Date(now.getTime() - DAY), taxSnapshot: {} } });
  const first = await pay(a.id, ids.a0, ids.a0term, "RAZORPAY", "INR", 50_000);
  await pay(a.id, ids.a1, ids.a1term, "OFFLINE", "INR", 30_000);
  await pay(b.id, ids.b0, ids.b0term, "STRIPE", "USD", 2_000);
  await prisma.refund.create({ data: { organisationId: a.id, paymentId: first.id, status: "PROCESSED", currency: "INR", amountMinor: 10_000, processedAt: now } });
  const hour = new Date(now.getTime() - 3_600_000);
  await prisma.outboxMessage.createMany({ data: [
    { kind: "payment-notice", payload: { to: SECRET_EMAIL }, status: "SENT", sentAt: hour, createdAt: hour },
    { kind: "payment-notice", payload: { to: SECRET_EMAIL }, status: "FAILED", lastError: SECRET_ERROR, createdAt: hour },
    { kind: "payment-notice", payload: { to: SECRET_EMAIL }, status: "PENDING", attempts: 2, createdAt: hour },
    { kind: "sms-code", payload: { phone: SECRET_PHONE }, status: "SENT", sentAt: hour, createdAt: hour },
    { kind: "chat-notice", payload: { text: SECRET_NAME }, status: "FAILED", createdAt: hour },
  ] });
  await prisma.memberMessageLog.createMany({ data: [
    { organisationId: a.id, memberId: ids.a0, kind: "payment-received", dedupeKey: `one-${suffix}`, status: "SENT", channel: "EMAIL" },
    { organisationId: a.id, memberId: ids.a1, kind: "payment-received", dedupeKey: `two-${suffix}`, status: "FAILED", channel: "SMS" },
  ] });
  await prisma.smsCode.create({ data: { purpose: "SIGN_IN", phoneHash: `hash-${suffix}`, country: "91", expiresAt: new Date(now.getTime() + 600_000), deliveryState: "delivered", consumedAt: now } });
  await prisma.auditEvent.createMany({ data: [
    { action: "SIGN_IN_FAILED", targetType: "SignInMethod", targetId: `password:bad_password`, metadata: { method: "password", reason: "bad_password" } },
    { action: "IP_BLOCKED", targetType: "Address", targetId: SECRET_IP, metadata: { failures: 20 } },
  ] });
  await prisma.operationalHeartbeat.upsert({ where: { key: "worker" }, create: { key: "worker", lastSucceededAt: now, lastError: SECRET_ERROR }, update: { lastSucceededAt: now, lastError: SECRET_ERROR } });
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { OR: [{ targetId: SECRET_IP }, { targetId: "password:bad_password" }] } }).catch(() => undefined);
  await prisma.outboxMessage.deleteMany({ where: { OR: [{ lastError: SECRET_ERROR }, { payload: { path: ["to"], equals: SECRET_EMAIL } }, { payload: { path: ["phone"], equals: SECRET_PHONE } }, { payload: { path: ["text"], equals: SECRET_NAME } }] } }).catch(() => undefined);
  await prisma.smsCode.deleteMany({ where: { phoneHash: `hash-${suffix}` } }).catch(() => undefined);
  // Paid payments and refunds can never be deleted (triggers), so the organisations stay in the disposable test database.
  await prisma.payment.deleteMany({ where: { organisationId: { in: orgs.map((org) => org.id) } } }).catch(() => undefined);
  await prisma.refund.deleteMany({ where: { organisationId: { in: orgs.map((org) => org.id) } } }).catch(() => undefined);
  await prisma.organisation.deleteMany({ where: { id: { in: orgs.map((org) => org.id) } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${suffix}@example.test` } } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe.sequential("platform analytics data", () => {
  it("adds the seeded organisations, members and joins to the growth headlines", async () => {
    const after = (await load()).growth;
    const delta = (pick: (view: Snapshot["growth"]) => number | null) => (pick(after) ?? 0) - (pick(before.growth) ?? 0);
    expect(delta((view) => view.headlines.organisationsLive.current)).toBe(2);
    expect(delta((view) => view.headlines.organisationsCreated.current)).toBe(2);
    expect(delta((view) => view.headlines.membersTotal.current)).toBe(5);
    expect(delta((view) => view.headlines.joins.current)).toBe(1);
    expect(delta((view) => view.headlines.membersActive.current)).toBe(1);
    expect(after.series).toHaveLength(30);
    expect(after.headlines.joins.previous).not.toBeNull();
  });

  it("keeps money per currency, online apart from in hand, and nets refunds", async () => {
    const after = (await load()).money.currencies;
    const find = (view: Snapshot["money"]["currencies"], currency: string) => view.find((row) => row.currency === currency);
    const base = (currency: string) => find(before.money.currencies, currency);
    const inr = find(after, "INR")!;
    const usd = find(after, "USD")!;
    expect(inr.collected - (base("INR")?.collected ?? 0)).toBe(80_000);
    expect(inr.refunds - (base("INR")?.refunds ?? 0)).toBe(10_000);
    expect(inr.net - (base("INR")?.net ?? 0)).toBe(70_000);
    expect(inr.online - (base("INR")?.online ?? 0)).toBe(50_000);
    expect(inr.inHand - (base("INR")?.inHand ?? 0)).toBe(30_000);
    expect(usd.collected - (base("USD")?.collected ?? 0)).toBe(2_000);
    expect(usd.online - (base("USD")?.online ?? 0)).toBe(2_000);
    // The third INR member has an unpaid term: outstanding is per currency too.
    expect(inr.outstanding - (base("INR")?.outstanding ?? 0)).toBe(50_000);
    expect(inr.points.reduce((sum, point) => sum + point.collected, 0)).toBe(inr.collected);
  });

  it("lists each seeded organisation once with its own members and revenue", async () => {
    const view = await loadSuperAdminLeaderboardView({ searchParams: params({ pageSize: "100", sort: "members" }) });
    const a = view.rows.find((row) => row.id === orgs[0].id)!;
    const b = view.rows.find((row) => row.id === orgs[1].id)!;
    expect(a).toMatchObject({ members: 4, href: `/super-admin/orgs/${orgs[0].id}/analytics`, status: "ACTIVE" });
    expect(a.revenue).toEqual([{ currency: "INR", minor: 70_000 }]);
    expect(b).toMatchObject({ members: 1 });
    expect(b.revenue).toEqual([{ currency: "USD", minor: 2_000 }]);
    expect(a.lastActivityAt).not.toBeNull();
    expect(view.rows.findIndex((row) => row.id === a.id)).toBeLessThan(view.rows.findIndex((row) => row.id === b.id));
    const paged = await loadSuperAdminLeaderboardView({ searchParams: params({ pageSize: "10", page: "999" }) });
    expect(paged.page).toBe(paged.pageCount);
    expect(paged.rows.length).toBeLessThanOrEqual(10);
  });

  it("counts operations without reading any content", async () => {
    const { health } = await load();
    const was = before.health;
    expect(health.outbox.totals.sent - was.outbox.totals.sent).toBe(2);
    expect(health.outbox.totals.failed - was.outbox.totals.failed).toBe(2);
    expect(health.outbox.totals.retrying - was.outbox.totals.retrying).toBe(1);
    expect(health.emails.totals.sent - was.emails.totals.sent).toBe(1);
    expect(health.chatAlerts.totals.failed - was.chatAlerts.totals.failed).toBe(1);
    const channel = (view: typeof health, name: string) => view.memberMessages.byChannel.find((row) => row.channel === name)!;
    expect(channel(health, "EMAIL").sent - channel(was, "EMAIL").sent).toBe(1);
    expect(channel(health, "SMS").failed - channel(was, "SMS").failed).toBe(1);
    expect(health.smsCodes.totals.consumed - was.smsCodes.totals.consumed).toBe(1);
    expect(health.signIns.totals.failed - was.signIns.totals.failed).toBe(1);
    expect(health.signIns.totals.blocked - was.signIns.totals.blocked).toBe(1);
    expect(health.outbox.now.oldestPendingSeconds).not.toBeNull();
    const worker = health.jobs.find((job) => job.key === "worker")!;
    expect(worker).toMatchObject({ status: "fresh", hasError: true });
  });

  it("never lets a name, email, phone, address or error text into any output", async () => {
    const everything = JSON.stringify([
      await loadSuperAdminGrowthView({ searchParams: params() }),
      await loadSuperAdminMoneyView({ searchParams: params({ range: "12m" }) }),
      await loadSuperAdminLeaderboardView({ searchParams: params({ pageSize: "100" }) }),
      await loadSuperAdminOperationsHealthView({ searchParams: Promise.resolve({ days: "90" }) }),
    ]);
    for (const secret of [SECRET_NAME, "Quentin", SECRET_EMAIL, "@example.test", SECRET_PHONE, "98470", SECRET_IP, "smtp password", `hash-${suffix}`]) expect(everything).not.toContain(secret);
  });

  it("refuses everyone but a super admin", async () => {
    mocks.userId = ids.plain;
    await expect(loadSuperAdminGrowthView({ searchParams: params() })).rejects.toThrow();
    await expect(loadSuperAdminMoneyView({ searchParams: params() })).rejects.toThrow();
    await expect(loadSuperAdminLeaderboardView({ searchParams: params() })).rejects.toThrow();
    await expect(loadSuperAdminOperationsHealthView({ searchParams: Promise.resolve({}) })).rejects.toThrow();
    mocks.userId = "";
    await expect(loadSuperAdminGrowthView({ searchParams: params() })).rejects.toThrow();
    mocks.userId = ids.admin;
  });
});
