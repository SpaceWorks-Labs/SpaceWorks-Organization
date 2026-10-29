import { randomUUID } from "node:crypto";
import { DeleteObjectsCommand, ListObjectsV2Command, ListObjectVersionsCommand, type ObjectIdentifier } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ send: vi.fn(), configured: true }));
vi.mock("@/lib/storage/client", () => ({
  storageConfigured: () => storage.configured,
  storageBucket: () => "test-photos",
  storageClient: () => ({ send: storage.send }),
}));

import { prisma } from "@/lib/db";
import { upsertMember } from "@/lib/membership/service";
import { getPublicUrl } from "@/lib/storage";
import { memberPhotoKey } from "@/lib/storage/memberPhotos";
import { runMemberPhotoSweep } from "@/lib/storage/photoSweep";

const DAY = 24 * 60 * 60_000;
const now = new Date("2026-10-29T12:00:00Z");
let orgId = "";
let objects: Array<{ Key: string; LastModified?: Date }>;
let deleted: ObjectIdentifier[];
let failDelete: boolean;

async function member(anonymised = false) {
  const row = await prisma.$transaction((tx) => upsertMember(tx, orgId, {
    name: "Sweep member", email: randomUUID() + "@example.test", source: "JOIN_FORM",
  }));
  if (anonymised) await prisma.member.update({ where: { id: row.id }, data: { anonymisedAt: now } });
  return row;
}

async function object(key: string, age = 2 * DAY, asset = true) {
  objects.push({ Key: key, LastModified: new Date(now.getTime() - age) });
  if (asset) await prisma.asset.create({ data: { key, organisationId: orgId, contentType: "image/webp", provider: "s3" } });
  return key;
}
const asset = (key: string) => prisma.asset.findUnique({ where: { key } });

beforeAll(async () => {
  orgId = (await prisma.organisation.create({ data: { name: "Photo sweep", slug: "photo-sweep-" + randomUUID() } })).id;
});

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("swo.memberPhotoSweep")];
  objects = [];
  deleted = [];
  failDelete = false;
  storage.configured = true;
  storage.send.mockReset().mockImplementation(async (command: unknown) => {
    if (command instanceof ListObjectsV2Command) {
      const start = Number(command.input.ContinuationToken ?? 0);
      // Tiny pages exercise pagination and resuming at the page budget.
      const end = start + 2;
      return { Contents: objects.slice(start, end), IsTruncated: end < objects.length, NextContinuationToken: end < objects.length ? String(end) : undefined };
    }
    if (command instanceof ListObjectVersionsCommand) {
      const key = command.input.Prefix!;
      return { Versions: [{ Key: key, VersionId: "v1" }, { Key: key, VersionId: "v2" }, { Key: key + ".other", VersionId: "keep" }], DeleteMarkers: [{ Key: key, VersionId: "marker" }] };
    }
    if (command instanceof DeleteObjectsCommand) {
      if (failDelete) return { Errors: [{ Code: "InternalError" }] };
      deleted.push(...command.input.Delete!.Objects!);
      return {};
    }
    throw new Error("Unexpected storage command");
  });
});

afterAll(async () => {
  if (orgId) {
    await prisma.asset.deleteMany({ where: { organisationId: orgId } });
    await prisma.organisation.delete({ where: { id: orgId } });
  }
  await prisma.$disconnect();
});

describe.sequential("daily member photo sweep", () => {
  it("purges old unattached objects, every version, and recent objects of erased or missing members", async () => {
    const live = await member();
    const erased = await member(true);
    const current = await object(memberPhotoKey(orgId, live.id));
    await prisma.member.update({ where: { id: live.id }, data: { photoUrl: getPublicUrl(current) } });
    const old = await object(memberPhotoKey(orgId, live.id));
    const recent = await object(memberPhotoKey(orgId, live.id), 60_000);
    const boundary = await object(memberPhotoKey(orgId, live.id), DAY);
    const anonymous = await object(memberPhotoKey(orgId, erased.id), 60_000);
    const missing = await object(memberPhotoKey(orgId, "missing-member"), 60_000);
    const crash = await object(memberPhotoKey(orgId, live.id), 2 * DAY, false);
    const outside = await object("organisations/" + orgId + "/member-id-artwork/" + randomUUID() + ".webp");
    const otherPrefix = await object("organisations/" + orgId + "/members-old/missing/photo.webp");
    const userPhoto = await object("users/missing/profile-images/photo.webp");
    const unknownAge = memberPhotoKey(orgId, live.id);
    objects.push({ Key: unknownAge });
    // A current URL does not exempt an anonymised member from the sweep.
    await prisma.member.update({ where: { id: erased.id }, data: { photoUrl: getPublicUrl(anonymous) } });

    expect(await runMemberPhotoSweep(now)).toBe(true);
    const removed = [old, anonymous, missing, crash];
    expect([...new Set(deleted.map((item) => item.Key))].sort()).toEqual(removed.sort());
    for (const key of removed) {
      expect(deleted.filter((item) => item.Key === key).map((item) => item.VersionId)).toEqual(["v1", "v2", "marker"]);
      expect(await asset(key)).toBeNull();
    }
    for (const key of [current, recent, boundary, outside, otherPrefix, userPhoto]) expect(await asset(key)).not.toBeNull();
    const lists = storage.send.mock.calls.map(([command]) => command).filter((command) => command instanceof ListObjectsV2Command);
    expect(lists.length).toBeGreaterThan(1);
    expect(lists.every((command) => command.input.Prefix === "organisations/")).toBe(true);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: live.id } })).photoUrl).toBe(getPublicUrl(current));
  });

  it("bounds each run, resumes an unfinished pass on the next run, and waits a day after a finished one", async () => {
    const live = await member();
    for (let i = 0; i < 3; i += 1) await object(memberPhotoKey(orgId, live.id));
    expect(await runMemberPhotoSweep(now, false, 1)).toBe(true);
    expect([...new Set(deleted.map((item) => item.Key))]).toHaveLength(2);
    expect(await runMemberPhotoSweep(now, false, 1)).toBe(true);
    expect([...new Set(deleted.map((item) => item.Key))]).toHaveLength(3);
    expect(await runMemberPhotoSweep(now, false, 1)).toBe(false);
    expect(await runMemberPhotoSweep(new Date(now.getTime() + DAY), false, 1)).toBe(true);
  });

  it("does nothing without configured storage", async () => {
    storage.configured = false;
    expect(await runMemberPhotoSweep(now)).toBe(false);
    expect(storage.send).not.toHaveBeenCalled();
  });

  it("allows only one instance to run a pass at a time", async () => {
    await object(memberPhotoKey(orgId, "missing-member"));
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"swo:member-photo-sweep"}))`;
      expect(await runMemberPhotoSweep(now)).toBe(false);
      expect(storage.send).not.toHaveBeenCalled();
    }, { timeout: 15_000 });
    expect(await runMemberPhotoSweep(now)).toBe(true);
  });

  it("retains Asset rows on purge failure and retries without waiting another day", async () => {
    const key = await object(memberPhotoKey(orgId, "missing-member"));
    failDelete = true;
    await expect(runMemberPhotoSweep(now)).rejects.toThrow("refused to delete");
    expect(await asset(key)).not.toBeNull();
    failDelete = false;
    expect(await runMemberPhotoSweep(now)).toBe(true);
    expect(await asset(key)).toBeNull();
  });
});
