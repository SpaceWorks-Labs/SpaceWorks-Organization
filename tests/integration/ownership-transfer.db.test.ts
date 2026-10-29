import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: null as string | null, sent: [] as string[] }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/message", () => ({ absoluteUrl: (path: string) => path, sendBrandedEmail: async (email: { to: string }) => void mocks.sent.push(email.to) }));

import { prisma } from "@/lib/db";
import { acceptOwnershipTransfer, cancelOwnershipTransfer, startOwnershipTransfer } from "@/app/actions/ownership";
import { deliverOwnershipNotice } from "@/lib/team/ownershipEmail";
import { addStaff, starterRole } from "@/tests/helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let org: { id: string; slug: string };
const u: Record<string, string> = {};
const email = (name: string) => `${name}-${suffix}@example.test`;

async function person(name: string) {
  const user = await prisma.user.create({ data: { email: email(name), name, emailVerified: new Date(), mfaEnabledAt: new Date() } });
  u[name] = user.id;
}

const as = (userId: string) => { mocks.userId = userId; };
const role = async (key: "OWNER" | "ADMIN" | "VIEWER") => (await starterRole(org.id, key)).id;
const member = (userId: string) => prisma.teamMember.findUniqueOrThrow({ where: { userId_organisationId: { userId, organisationId: org.id } } });
const open = () => prisma.ownershipTransfer.findFirstOrThrow({ where: { organisationId: org.id, acceptedAt: null, cancelledAt: null } });
const start = async (targetUserId: string) => startOwnershipTransfer({ organisationSlug: org.slug, targetUserId, keepRoleId: await role("ADMIN") });
async function outbox(transferId: string) {
  const rows = await prisma.outboxMessage.findMany({ where: { kind: "ownership-transfer", payload: { path: ["transferId"], equals: transferId } } });
  return rows.map((row) => row.payload as { to: string; notice: string }).sort((a, b) => a.notice.localeCompare(b.notice));
}
const closed = { ok: false, error: "This transfer is no longer open." };

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Transfer Club", slug: `transfer-${suffix}`, status: "ACTIVE", unitLevels: ["Area"] } });
  org = { id: created.id, slug: created.slug };
  const area = await prisma.orgUnit.create({ data: { organisationId: org.id, name: "Area", slug: `area-${suffix}`, code: "AREA", path: "pending" } });
  await prisma.orgUnit.update({ where: { id: area.id }, data: { path: area.id } });
  for (const name of ["owner", "manager", "viewer", "scoped", "outsider"]) await person(name);
  await addStaff(org.id, u.owner, "OWNER");
  await addStaff(org.id, u.manager, "ADMIN");
  await addStaff(org.id, u.viewer, "VIEWER");
  await addStaff(org.id, u.scoped, "ADMIN", area.id);
});

afterAll(async () => {
  const transfers = await prisma.ownershipTransfer.findMany({ where: { organisationId: org.id }, select: { id: true } });
  for (const transfer of transfers) await prisma.outboxMessage.deleteMany({ where: { kind: "ownership-transfer", payload: { path: ["transferId"], equals: transfer.id } } });
  await prisma.ownershipTransfer.deleteMany({ where: { organisationId: org.id } });
  await prisma.teamMember.deleteMany({ where: { organisationId: org.id } });
  await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: Object.values(u) } } });
  await prisma.$disconnect();
});

describe.sequential("ownership transfer", () => {
  it("refuses staff for one unit, yourself, other staff starting it, and the Owner role as the one kept", async () => {
    as(u.owner);
    expect(await start(u.scoped)).toMatchObject({ ok: false, error: expect.stringContaining("whole organisation") });
    expect(await start(u.owner)).toMatchObject({ ok: false });
    expect(await startOwnershipTransfer({ organisationSlug: org.slug, targetUserId: u.manager, keepRoleId: await role("OWNER") })).toMatchObject({ ok: false });
    as(u.manager);
    expect(await start(u.viewer)).toMatchObject({ ok: false });
    expect(await prisma.ownershipTransfer.count({ where: { organisationId: org.id } })).toBe(0);
  });

  it("starts one open transfer and queues the offer to the proposed owner", async () => {
    as(u.owner);
    expect(await start(u.manager)).toEqual({ ok: true });
    const transfer = await open();
    expect(transfer).toMatchObject({ fromUserId: u.owner, toUserId: u.manager, keepRoleId: await role("ADMIN") });
    expect(Buffer.from(transfer.token, "base64url")).toHaveLength(32);
    expect(await outbox(transfer.id)).toEqual([{ to: email("manager"), transferId: transfer.id, notice: "offered" }]);
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "OWNERSHIP_TRANSFER_STARTED", targetId: transfer.id } })).toBe(1);
    expect(await start(u.viewer)).toMatchObject({ ok: false, error: expect.stringContaining("already waiting") });
    await expect(prisma.ownershipTransfer.create({ data: { organisationId: org.id, fromUserId: u.owner, toUserId: u.viewer, keepRoleId: await role("ADMIN"), token: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) } })).rejects.toThrow();
  });

  it("lets only the named person accept", async () => {
    const { token } = await open();
    for (const someone of [u.viewer, u.outsider, u.owner]) {
      as(someone);
      expect(await acceptOwnershipTransfer({ token })).toEqual(closed);
    }
    expect((await member(u.owner)).roleId).toBe(await role("OWNER"));
  });

  it("can't be accepted once the owner cancels it", async () => {
    const { token, id } = await open();
    as(u.owner);
    expect(await cancelOwnershipTransfer({ organisationSlug: org.slug })).toEqual({ ok: true });
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "OWNERSHIP_TRANSFER_CANCELLED", targetId: id } })).toBe(1);
    as(u.manager);
    expect(await acceptOwnershipTransfer({ token })).toEqual(closed);
    as(u.owner);
    expect(await cancelOwnershipTransfer({ organisationSlug: org.slug })).toMatchObject({ ok: false });
  });

  it("can't be accepted after it expires, and an expired offer makes room for a new one", async () => {
    as(u.owner);
    expect(await start(u.manager)).toEqual({ ok: true });
    const expired = await open();
    await prisma.ownershipTransfer.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    as(u.manager);
    expect(await acceptOwnershipTransfer({ token: expired.token })).toEqual(closed);
    as(u.owner);
    expect(await start(u.manager)).toEqual({ ok: true });
    expect((await prisma.ownershipTransfer.findUniqueOrThrow({ where: { id: expired.id } })).cancelledAt).not.toBeNull();
  });

  it("refuses a proposed owner who no longer holds their role for the whole organisation", async () => {
    const { token } = await open();
    const area = await prisma.orgUnit.findFirstOrThrow({ where: { organisationId: org.id } });
    await prisma.teamMember.update({ where: { id: (await member(u.manager)).id }, data: { unitId: area.id } });
    as(u.manager);
    expect(await acceptOwnershipTransfer({ token })).toMatchObject({ ok: false, error: expect.stringContaining("whole organisation") });
    await prisma.teamMember.update({ where: { id: (await member(u.manager)).id }, data: { unitId: null } });
  });

  it("swaps the roles on acceptance, queues both emails and audits it", async () => {
    const transfer = await open();
    as(u.manager);
    expect(await acceptOwnershipTransfer({ token: transfer.token })).toEqual({ ok: true, data: { href: `/dashboard/${org.slug}/team` } });
    expect(await member(u.manager)).toMatchObject({ roleId: await role("OWNER"), role: "OWNER", unitId: null });
    expect(await member(u.owner)).toMatchObject({ roleId: await role("ADMIN"), role: "ADMIN" });
    expect((await prisma.ownershipTransfer.findUniqueOrThrow({ where: { id: transfer.id } })).acceptedAt).not.toBeNull();
    expect((await outbox(transfer.id)).map((row) => [row.notice, row.to])).toEqual([
      ["accepted-new-owner", email("manager")],
      ["accepted-previous-owner", email("owner")],
      ["offered", email("manager")],
    ]);
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "OWNERSHIP_TRANSFER_ACCEPTED", targetId: transfer.id } })).toBe(1);
    expect(await acceptOwnershipTransfer({ token: transfer.token })).toEqual(closed);
  });

  it("drops an offer email once the offer is closed, and sends the outcome", async () => {
    const accepted = await prisma.ownershipTransfer.findFirstOrThrow({ where: { organisationId: org.id, acceptedAt: { not: null } } });
    mocks.sent.length = 0;
    expect(await deliverOwnershipNotice({ to: email("manager"), transferId: accepted.id, notice: "offered" }, "m1")).toBe("dropped");
    expect(await deliverOwnershipNotice({ to: email("owner"), transferId: accepted.id, notice: "accepted-previous-owner" }, "m2")).toBe("sent");
    expect(mocks.sent).toEqual([email("owner")]);
  });
});
