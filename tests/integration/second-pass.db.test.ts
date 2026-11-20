import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/publicUrl", async (original) => ({ ...(await original<typeof import("@/lib/publicUrl")>()), getRequestOrigin: async () => "http://localhost:3000" }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`redirect:${to}`); },
  notFound: () => { throw new Error("not-found"); },
}));

import { prisma } from "@/lib/db";
import { upsertMember } from "@/lib/membership/service";
import { hasRoomForMember, lockMemberByEmail } from "@/lib/membership/memberLock";
import { loadMemberView } from "@/lib/views/app__dashboard__orgSlug__members__memberId__page";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const slug = `second-pass-${suffix}`;
let orgId = "";
let memberId = "";
const users: Record<string, string> = {};

async function staffWith(key: string, capabilities: string[]) {
  const user = await prisma.user.create({ data: { email: `${key}-${suffix}@example.test`, emailVerified: new Date(), mfaEnabledAt: new Date() } });
  const role = await prisma.orgRole.create({ data: { organisationId: orgId, name: `Role ${key}`, capabilities } });
  await prisma.teamMember.create({ data: { organisationId: orgId, userId: user.id, role: "VIEWER", roleId: role.id } });
  users[key] = user.id;
}

beforeAll(async () => {
  orgId = (await prisma.organisation.create({ data: { name: "Second Pass", slug, status: "ACTIVE", memberLimit: 3 } })).id;
  memberId = (await prisma.$transaction((tx) => upsertMember(tx, orgId, { email: `child-${suffix}@example.test`, name: "Asha Menon", phone: "+919800000000", isMinor: true, guardianName: "Parent", guardianEmail: `parent-${suffix}@example.test`, guardianPhone: "+919811111111", source: "MANUAL" }))).id;
  await staffWith("viewer", ["org.view", "members.view"]);
  await staffWith("contact", ["org.view", "members.view", "members.contact"]);
});

afterAll(async () => {
  await prisma.organisation.delete({ where: { id: orgId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await prisma.$disconnect();
});

describe.sequential("second-pass fixes", () => {
  it("gives a viewer without members.contact no contact or guardian contact fields", async () => {
    mocks.userId = users.viewer!;
    const { member, showContact } = await loadMemberView({ params: Promise.resolve({ orgSlug: slug, memberId }) });
    expect(showContact).toBe(false);
    for (const field of ["email", "phone", "guardianEmail", "guardianPhone", "notes", "gstin", "userId", "fieldValues"]) expect(member).not.toHaveProperty(field);
    expect(JSON.stringify(member)).not.toContain(`parent-${suffix}`);
    expect(JSON.stringify(member)).not.toContain("9811111111");
  });

  it("gives staff with members.contact the contact fields", async () => {
    mocks.userId = users.contact!;
    const { member } = await loadMemberView({ params: Promise.resolve({ orgSlug: slug, memberId }) });
    expect(member).toMatchObject({ email: `child-${suffix}@example.test`, guardianEmail: `parent-${suffix}@example.test`, guardianPhone: "+919811111111" });
  });

  it("never lets concurrent creates pass the member limit", async () => {
    const create = (n: number) => prisma.$transaction(async (tx) => {
      const email = `race-${n}-${suffix}@example.test`;
      const locked = await lockMemberByEmail(tx, orgId, email);
      if (!locked && !(await hasRoomForMember(tx, orgId))) return false;
      await upsertMember(tx, orgId, { email, name: `Racer ${n}`, source: "MANUAL" });
      return true;
    }, { timeout: 20_000 });
    const results = await Promise.all(Array.from({ length: 8 }, (_, n) => create(n)));
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(await prisma.member.count({ where: { organisationId: orgId } })).toBe(3);
  });
});
