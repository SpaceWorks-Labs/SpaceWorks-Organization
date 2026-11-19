import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addStaff, starterRole } from "../helpers/staff";

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (mocks.userId ? { user: { id: mocks.userId } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { prisma } from "@/lib/db";
import { saveOrgWebTelemetry } from "@/app/actions/org-web-telemetry";
import { emptyTelemetryConfig, type WebTelemetryConfig } from "@/lib/telemetry/types";

// Real roles and the real permission gate: only the Owner (or a super admin acting as one) may save an
// organisation's analytics, and only for that organisation.
const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const slugs = { mine: `analytics-a-${suffix}`, other: `analytics-b-${suffix}` };
const ids: Record<string, string> = {};
const config = (): WebTelemetryConfig => ({ ...emptyTelemetryConfig(), pageview: { provider: "ga4", siteId: "G-FAKE123", endpoint: "" } });
const save = (slug: string) => saveOrgWebTelemetry({ organisationSlug: slug, config: config() });

async function person(key: string, isSuperAdmin = false) {
  const user = await prisma.user.create({ data: { email: `${key}-${suffix}@example.test`, emailVerified: new Date(), mfaEnabledAt: new Date(), isSuperAdmin } });
  ids[key] = user.id;
  return user.id;
}

beforeAll(async () => {
  ids.mine = (await prisma.organisation.create({ data: { name: "Example Analytics A", slug: slugs.mine, status: "ACTIVE" } })).id;
  ids.other = (await prisma.organisation.create({ data: { name: "Example Analytics B", slug: slugs.other, status: "ACTIVE" } })).id;
  await starterRole(ids.mine, "OWNER");
  await starterRole(ids.other, "OWNER");
  await addStaff(ids.mine, await person("owner"), "OWNER");
  await addStaff(ids.mine, await person("manager"), "ADMIN");
  await addStaff(ids.mine, await person("viewer"), "VIEWER");
  await person("platform", true);
});

afterAll(async () => {
  await prisma.organisation.deleteMany({ where: { id: { in: [ids.mine, ids.other] } } });
  await prisma.user.deleteMany({ where: { id: { in: ["owner", "manager", "viewer", "platform"].map((key) => ids[key]) } } });
  await prisma.$disconnect();
});

describe.sequential("saveOrgWebTelemetry with real roles", () => {
  it("refuses a manager and a viewer, and writes nothing", async () => {
    for (const key of ["manager", "viewer"]) {
      mocks.userId = ids[key];
      await expect(save(slugs.mine)).resolves.toMatchObject({ ok: false });
    }
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: ids.mine } })).webTelemetry).toBeNull();
  });

  it("refuses the owner of one organisation on another, as if it did not exist", async () => {
    mocks.userId = ids.owner;
    await expect(save(slugs.other)).resolves.toEqual({ ok: false, error: "Organisation not found." });
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: ids.other } })).webTelemetry).toBeNull();
  });

  it("lets the owner save, and audits the changed field names", async () => {
    mocks.userId = ids.owner;
    await expect(save(slugs.mine)).resolves.toEqual({ ok: true });
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: ids.mine } })).webTelemetry).toEqual(config());
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { organisationId: ids.mine, action: "ORG_WEB_TELEMETRY_UPDATED" } });
    expect(event.actorUserId).toBe(ids.owner);
    expect(JSON.stringify(event.metadata)).toContain("pageview.provider");
    expect(JSON.stringify(event.metadata)).not.toContain("G-FAKE123");
  });

  it("lets a super admin save for any organisation, audited as platform access", async () => {
    mocks.userId = ids.platform;
    await expect(save(slugs.other)).resolves.toEqual({ ok: true });
    expect((await prisma.organisation.findUniqueOrThrow({ where: { id: ids.other } })).webTelemetry).toEqual(config());
    expect(await prisma.auditEvent.count({ where: { organisationId: ids.other, action: "SUPER_ADMIN_ORG_ACTION", actorUserId: ids.platform } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { organisationId: ids.other, action: "ORG_WEB_TELEMETRY_UPDATED" } })).toBe(1);
  });
});
