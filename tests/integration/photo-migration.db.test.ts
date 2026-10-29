import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/memberPhotos", async (original) => {
  const actual = await original<typeof import("@/lib/storage/memberPhotos")>();
  return { ...actual, copyStoredObject: vi.fn(actual.copyStoredObject) };
});

import { prisma } from "@/lib/db";
import { upsertMember } from "@/lib/membership/service";
import { copyStoredObject, memberPhotoKey } from "@/lib/storage/memberPhotos";
import { getPublicUrl } from "@/lib/storage";
import { migrateMemberPhotos } from "@/lib/storage/photoMigration";
import { runStorageCleanup } from "@/lib/storage/cleanup";
import { OUTBOX_KINDS } from "@/lib/outboxKinds";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const realCopy = vi.mocked(copyStoredObject).getMockImplementation()!;
let orgId = "";

async function memberWithLegacyPhoto(name: string) {
  const member = await prisma.$transaction((tx) => upsertMember(tx, orgId, { email: `${name}-${randomUUID().slice(0, 8)}-${suffix}@example.test`, name, source: "JOIN_FORM" }));
  const id = randomUUID();
  const key = `organisations/${orgId}/member-id-photos/${id}.webp`;
  await prisma.asset.create({ data: { key, contentType: "image/webp", byteSize: BigInt(4), provider: "database", fileData: new Uint8Array([1, 2, 3, 4]), organisationId: orgId } });
  await prisma.member.update({ where: { id: member.id }, data: { photoUrl: getPublicUrl(key) } });
  return { id: member.id, key, target: memberPhotoKey(orgId, member.id, id) };
}

const photoOf = async (memberId: string) => (await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).photoUrl;
const asset = (key: string) => prisma.asset.findUnique({ where: { key } });

/** Run the old-file deletions the moves queued, as the worker would. */
async function deliverQueuedPurges() {
  const jobs = await prisma.outboxMessage.findMany({ where: { kind: "legacy-photo-purge", payload: { path: ["organisationId"], equals: orgId } } });
  for (const job of jobs) await OUTBOX_KINDS["legacy-photo-purge"].deliver(job.payload, "test");
  await prisma.outboxMessage.deleteMany({ where: { id: { in: jobs.map((job) => job.id) } } });
}

beforeAll(async () => {
  orgId = (await prisma.organisation.create({ data: { name: "Photo Move Club", slug: `photo-move-${suffix}`, status: "ACTIVE" } })).id;
});

beforeEach(() => {
  vi.mocked(copyStoredObject).mockImplementation(realCopy);
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("swo.storageCleanup")];
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { organisationId: orgId } });
  await prisma.organisation.delete({ where: { id: orgId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe.sequential("moving member photos", () => {
  it("keeps the photo another instance moved to the same key while this one copied", async () => {
    const photo = await memberWithLegacyPhoto("winner");
    vi.mocked(copyStoredObject).mockImplementation(async (from, to, organisationId) => {
      const copied = await realCopy(from, to, organisationId);
      // The other instance finishes first and points the member at the shared new key.
      await prisma.member.update({ where: { id: photo.id }, data: { photoUrl: getPublicUrl(to) } });
      return copied;
    });
    expect(await migrateMemberPhotos(50)).toMatchObject({ moved: 0 });
    expect(await photoOf(photo.id)).toBe(getPublicUrl(photo.target));
    expect(await asset(photo.target)).not.toBeNull();
  });

  it("clears a photo whose source object is gone from the store, and drops its Asset row", async () => {
    const photo = await memberWithLegacyPhoto("missing");
    vi.mocked(copyStoredObject).mockRejectedValue(Object.assign(new Error("The specified key does not exist."), { name: "NoSuchKey" }));
    await migrateMemberPhotos(50);
    await deliverQueuedPurges();
    expect(await photoOf(photo.id)).toBeNull();
    expect(await asset(photo.key)).toBeNull();
    expect(await asset(photo.target)).toBeNull();
  });

  it("passes over a photo that keeps failing, and retries it on a later full pass", async () => {
    const photos = [await memberWithLegacyPhoto("first"), await memberWithLegacyPhoto("second")].sort((a, b) => (a.id < b.id ? -1 : 1));
    const [stuck, next] = photos as [typeof photos[number], typeof photos[number]];
    vi.mocked(copyStoredObject).mockImplementation(async (from, to, organisationId) => {
      if (from === stuck.key) throw new Error("Store unavailable");
      return realCopy(from, to, organisationId);
    });
    const first = await migrateMemberPhotos(1, null);
    expect(first.lastId).not.toBeNull();
    let after = first.lastId;
    for (let pass = 0; pass < 20 && (await photoOf(next.id)) !== getPublicUrl(next.target); pass += 1) after = (await migrateMemberPhotos(1, after)).lastId;
    expect(await photoOf(next.id)).toBe(getPublicUrl(next.target));
    expect(await photoOf(stuck.id)).toBe(getPublicUrl(stuck.key));

    // The store recovers: a later full pass of the clean-up picks the stuck photo up.
    vi.mocked(copyStoredObject).mockImplementation(realCopy);
    for (let pass = 0; pass < 20 && (await photoOf(stuck.id)) !== getPublicUrl(stuck.target); pass += 1) await runStorageCleanup();
    expect(await photoOf(stuck.id)).toBe(getPublicUrl(stuck.target));
    await deliverQueuedPurges();
    expect(await asset(stuck.key)).toBeNull();
  });

  it("runs the clean-up on one instance at a time", async () => {
    const photo = await memberWithLegacyPhoto("locked");
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"swo:storage-cleanup"}))`;
      expect(await runStorageCleanup()).toBe(false);
      expect(await photoOf(photo.id)).toBe(getPublicUrl(photo.key));
    }, { timeout: 15_000 });
    expect(await runStorageCleanup()).toBe(true);
    for (let pass = 0; pass < 20 && (await photoOf(photo.id)) !== getPublicUrl(photo.target); pass += 1) await runStorageCleanup();
    expect(await photoOf(photo.id)).toBe(getPublicUrl(photo.target));
  });
});
