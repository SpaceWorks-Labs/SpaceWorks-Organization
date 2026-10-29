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
import { requireOrgCapability } from "@/lib/permissions";
import { loadMemberView } from "@/lib/views/app__dashboard__orgSlug__members__memberId__page";
import { loadPaymentSettingsView } from "@/lib/views/app__dashboard__orgSlug__settings__payments__page";

// Custom roles may leave out any permission: a denied page lands somewhere the role can open, and member page
// controls follow the permission their action checks.
const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const slug = `custom-roles-${suffix}`;
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
  orgId = (await prisma.organisation.create({ data: { name: "Example Network", slug, status: "ACTIVE" } })).id;
  memberId = (await prisma.$transaction((tx) => upsertMember(tx, orgId, { email: `member-${suffix}@example.test`, name: "Asha Menon", source: "MANUAL" }))).id;
  await staffWith("directory", ["members.view"]);
  await staffWith("cards", ["cards.manage"]);
  await staffWith("roles", ["roles.manage"]);
  await staffWith("finance", ["reports.finance"]);
  await staffWith("erasure", ["members.view", "erasure.decide"]);
  await staffWith("manager", ["org.view", "members.view", "members.manage"]);
  await staffWith("settings", ["org.view", "payments.settings"]);
});

afterAll(async () => {
  await prisma.organisation.delete({ where: { id: orgId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await prisma.$disconnect();
});

describe.sequential("custom roles on dashboard pages", () => {
  it("sends a role without the overview to a page it can open, never back to the overview", async () => {
    mocks.userId = users.directory!;
    await expect(requireOrgCapability(slug, "org.view")).rejects.toThrow(`redirect:/dashboard/${slug}/members`);
  });

  it("lands a role that only manages staff roles or reads finance on its own page", async () => {
    mocks.userId = users.roles!;
    await expect(requireOrgCapability(slug, "org.view")).rejects.toThrow(`redirect:/dashboard/${slug}/settings/roles`);
    mocks.userId = users.finance!;
    await expect(requireOrgCapability(slug, "org.view")).rejects.toThrow(`redirect:/dashboard/${slug}/reports/money`);
  });

  it("ends in not found when the role opens none of the landing pages", async () => {
    mocks.userId = users.cards!;
    await expect(requireOrgCapability(slug, "org.view")).rejects.toThrow("not-found");
  });

  it("opens payment settings to a role that changes them without reading payment records", async () => {
    mocks.userId = users.settings!;
    expect(await loadPaymentSettingsView({ params: Promise.resolve({ orgSlug: slug }) })).toMatchObject({ canEdit: true });
    mocks.userId = users.directory!;
    await expect(loadPaymentSettingsView({ params: Promise.resolve({ orgSlug: slug }) })).rejects.toThrow(`redirect:/dashboard/${slug}/members`);
  });

  it("offers erasure decisions by the erasure permission, not member management", async () => {
    const view = async (key: string) => {
      mocks.userId = users[key]!;
      return loadMemberView({ params: Promise.resolve({ orgSlug: slug, memberId }) });
    };
    expect(await view("erasure")).toMatchObject({ canDecideErasure: true, canManage: false });
    expect(await view("manager")).toMatchObject({ canDecideErasure: false, canManage: true });
  });
});
