import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current ? { user: identity.current } : null) }));
// Small limits, so three cards are enough to cross one.
vi.mock("@/lib/cards/render", async (original) => ({ ...(await original<typeof import("@/lib/cards/render")>()), BULK_ZIP_LIMIT: 2, BULK_PDF_LIMIT: 3 }));

import { prisma } from "@/lib/db";
import { decideTerm, openTerm, upsertMember } from "@/lib/membership/service";
import { loadCardForRender } from "@/lib/cards/data";
import { renderMemberCard } from "@/lib/cards/render";
import { tryAcquireRenderSlot } from "@/lib/cards/renderSlot";
import { readZip } from "@/lib/cards/zip";
import { authorizeCardAccess } from "@/lib/cards/access";
import { GET } from "@/app/api/exports/cards/[orgSlug]/route";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const users: Record<string, string> = {};
let org: { id: string; slug: string; timezone: string; financialYearStartMonth: number };
let plan: Awaited<ReturnType<typeof prisma.membershipPlan.create>>;
const units: Record<string, string> = {};

function download(query: string, slug = org.slug) {
  return GET(new Request(`http://localhost/api/exports/cards/${slug}?${query}`), { params: Promise.resolve({ orgSlug: slug }) });
}
const as = (key: string | null) => {
  identity.current = key ? { id: users[key]! } : null;
};
async function errorOf(response: Response) {
  return ((await response.json()) as { error: string }).error;
}

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Downloads Club", slug: `downloads-${suffix}`, status: "ACTIVE" } });
  org = { id: created.id, slug: created.slug, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Annual", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "APPROVAL" } });
  for (const key of ["north", "south"]) {
    const unit = await prisma.orgUnit.create({ data: { organisationId: org.id, name: key, slug: key, code: key.toUpperCase(), level: 0, path: "pending" } });
    await prisma.orgUnit.update({ where: { id: unit.id }, data: { path: unit.id } });
    units[key] = unit.id;
  }
  for (const key of ["owner", "unitManager", "treasurer", "noAuthenticator", "stranger"]) {
    const user = await prisma.user.create({ data: { email: `${key.toLowerCase()}-${suffix}@example.test`, emailVerified: new Date(), mfaEnabledAt: key === "noAuthenticator" ? null : new Date() } });
    users[key] = user.id;
  }
  await addStaff(org.id, users.owner!, "OWNER");
  await addStaff(org.id, users.unitManager!, "ADMIN", units.north!);
  await addStaff(org.id, users.treasurer!, "TREASURER");
  await addStaff(org.id, users.noAuthenticator!, "ADMIN");
  for (const [name, unit] of [["Asha Menon", "north"], ["Binu Thomas", "north"], ["Chitra Nair", "south"]] as const) {
    await prisma.$transaction(async (tx) => {
      const member = await upsertMember(tx, org.id, { email: `${name.split(" ")[0]!.toLowerCase()}-${suffix}@example.test`, name, source: "JOIN_FORM" });
      await tx.member.update({ where: { id: member.id }, data: { unitId: units[unit] } });
      const term = await openTerm(tx, { org, plan, memberId: member.id, byManager: false, actorUserId: null });
      await decideTerm(tx, { org, termId: term.id, action: "approve", actorUserId: users.owner! });
    });
  }
});

afterAll(async () => {
  vi.useRealTimers();
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
  await prisma.memberCard.deleteMany({ where: { organisationId: org.id } });
  await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await prisma.$disconnect();
});

describe.sequential("bulk card downloads", () => {
  it("streams a ZIP whose PDFs are the single-card renders, inside the requester's unit", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-29T06:00:00Z") });
    as("unitManager");
    const response = await download("format=zip");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const entries = readZip(Buffer.from(await response.arrayBuffer()));
    expect(entries).toHaveLength(2);
    const cards = await prisma.memberCard.findMany({ where: { organisationId: org.id, member: { unitId: units.north } } });
    for (const card of cards) {
      const entry = entries.find((item) => item.name.startsWith(`${card.cardNumber}-annual-`));
      expect(entry, card.cardNumber).toBeDefined();
      const loaded = await loadCardForRender(card.id);
      const single = await renderMemberCard(loaded!.input, loaded!.holder, "pdf", { title: `${loaded!.holder.displayName} membership card` });
      expect(Buffer.compare(Buffer.from(entry!.data), Buffer.from(single))).toBe(0);
    }
    vi.useRealTimers();
    // The slot is free again once the stream has finished.
    const release = tryAcquireRenderSlot();
    expect(release).not.toBeNull();
    release!();
    const audit = await prisma.auditEvent.findFirst({ where: { organisationId: org.id, action: "CARD_EXPORT_DOWNLOADED", actorUserId: users.unitManager }, orderBy: { createdAt: "desc" } });
    expect(audit?.metadata).toMatchObject({ cards: 2, format: "zip", scoped: true });
  });

  it("is a valid archive for an independent reader", async () => {
    as("unitManager");
    const zip = Buffer.from(await (await download("format=zip")).arrayBuffer());
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    let offset = zip.readUInt32LE(end + 16);
    for (let index = 0; index < 2; index += 1) {
      expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
      const local = zip.readUInt32LE(offset + 42);
      const size = zip.readUInt32LE(offset + 20);
      const nameLength = zip.readUInt16LE(offset + 28);
      const start = local + 30 + zip.readUInt16LE(local + 26);
      const { crc32 } = await import("node:zlib");
      expect(crc32(zip.subarray(start, start + size)) >>> 0).toBe(zip.readUInt32LE(offset + 16));
      expect(zip.subarray(start, start + 5).toString()).toBe("%PDF-");
      offset += 46 + nameLength;
    }
  });

  it("draws the combined PDF in the request", async () => {
    as("owner");
    const response = await download(`format=sheet&plan=${plan.id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(`${org.slug}-cards-`);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("refuses more cards than one download takes, and an empty filter", async () => {
    as("owner");
    const tooMany = await download("format=zip");
    expect(tooMany.status).toBe(400);
    expect(await errorOf(tooMany)).toContain("3 cards match; one download takes up to 2");
    const none = await download("format=cards&q=nobody-here");
    expect(none.status).toBe(404);
    expect(await errorOf(none)).toBe("None of these members has a card yet.");
    expect((await download("format=docx")).status).toBe(400);
  });

  it("answers 429 while another bulk render holds the slot", async () => {
    as("owner");
    const release = tryAcquireRenderSlot()!;
    try {
      const busy = await download("format=cards");
      expect(busy.status).toBe(429);
      expect(await errorOf(busy)).toContain("Another card download is being prepared");
    } finally {
      release();
    }
  });

  it("checks sign-in, the team, the authenticator and the permission", async () => {
    as(null);
    expect((await download("format=cards")).status).toBe(401);
    as("stranger");
    expect((await download("format=cards")).status).toBe(404);
    as("noAuthenticator");
    expect((await download("format=cards")).status).toBe(403);
    as("treasurer");
    const refused = await download("format=cards");
    expect(refused.status).toBe(403);
    expect(await errorOf(refused)).toBe("Your role can't download cards.");
    as("owner");
    expect((await download("format=cards", `missing-${suffix}`)).status).toBe(404);
  });

  it("lets staff open one card only with an authenticator", async () => {
    const card = await prisma.memberCard.findFirstOrThrow({ where: { organisationId: org.id } });
    as("noAuthenticator");
    expect(await authorizeCardAccess(card.id)).toBeNull();
    as("owner");
    expect(await authorizeCardAccess(card.id)).toEqual({ userId: users.owner, as: "team" });
  });
});
