import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { upsertMember } from "@/lib/membership/service";
import { setMemberPhoto } from "@/app/actions/member-photo";
import { setOwnMemberPhoto } from "@/app/actions/portal-photo";
import { setMemberPhotoUpload } from "@/app/actions/member-portal";
import { decideErasureRequest } from "@/app/actions/erasure";
import { migrateMemberPhotos } from "@/lib/storage/photoMigration";
import { memberPhotoKey } from "@/lib/storage/memberPhotos";
import { uploadKeyFromUrl } from "@/lib/uploadUrl";
import { OUTBOX_KINDS, PermanentOutboxError } from "@/lib/outboxKinds";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const users: Record<string, { id: string; email: string }> = {};
const members: Record<string, string> = {};
let org: { id: string; slug: string };
const as = (key: string | null) => {
  identity.current = key ? { id: users[key]!.id } : null;
};
const keyOf = async (memberId: string) => uploadKeyFromUrl((await prisma.member.findUniqueOrThrow({ where: { id: memberId } })).photoUrl ?? "");

async function photoForm(fields: Record<string, string>) {
  const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#3366aa" } }).png().toBuffer();
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set("file", new File([new Uint8Array(png)], "me.png", { type: "image/png" }));
  return form;
}

/** A photo stored the way releases before 0.7 did (database storage, as in development and tests). */
async function legacyPhoto(memberId: string) {
  const key = `organisations/${org.id}/member-id-photos/${randomUUID()}.webp`;
  await prisma.asset.create({ data: { key, contentType: "image/webp", byteSize: BigInt(4), provider: "database", fileData: new Uint8Array([1, 2, 3, 4]), organisationId: org.id } });
  await prisma.member.update({ where: { id: memberId }, data: { photoUrl: `http://localhost:3000/api/uploads/${key}` } });
  return key;
}

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Photo Club", slug: `photos-${suffix}`, status: "ACTIVE", memberPortal: true } });
  org = { id: created.id, slug: created.slug };
  for (const key of ["owner", "asha", "binu", "unverified"]) {
    const user = await prisma.user.create({ data: { email: `${key}-${suffix}@example.test`, emailVerified: key === "unverified" ? null : new Date(), mfaEnabledAt: new Date() } });
    users[key] = { id: user.id, email: user.email! };
  }
  await addStaff(org.id, users.owner!.id, "OWNER");
  for (const key of ["asha", "binu", "unverified"]) {
    const member = await prisma.$transaction((tx) => upsertMember(tx, org.id, { email: users[key]!.email, name: key, source: "JOIN_FORM" }));
    members[key] = member.id;
  }
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { organisationId: org.id } });
  await prisma.organisation.delete({ where: { id: org.id } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((user) => user.id) } } });
  await prisma.$disconnect();
});

describe.sequential("member photos", () => {
  it("stores a manager's upload under the member's own prefix and deletes the previous photo", async () => {
    as("owner");
    const old = await legacyPhoto(members.asha!);
    const result = await setMemberPhoto(await photoForm({ organisationSlug: org.slug, memberId: members.asha! }));
    expect(result.ok).toBe(true);
    const key = await keyOf(members.asha!);
    expect(key).toMatch(new RegExp(`^organisations/${org.id}/members/${members.asha}/photo-[0-9a-f-]{36}\\.webp$`));
    expect(await prisma.asset.findUnique({ where: { key: key! } })).toMatchObject({ contentType: "image/webp", provider: "database" });
    expect(await prisma.asset.findUnique({ where: { key: old } })).toBeNull();
  });

  it("lets members upload their own photo only when the organisation allows it, found by verified email", async () => {
    as("binu");
    const off = await setOwnMemberPhoto(await photoForm({ organisationSlug: org.slug }));
    expect(off).toMatchObject({ ok: false, error: expect.stringContaining("adds member photos itself") });

    as("binu");
    expect(await setMemberPhotoUpload({ organisationSlug: org.slug, enabled: true })).toMatchObject({ ok: false });
    as("owner");
    expect(await setMemberPhotoUpload({ organisationSlug: org.slug, enabled: true })).toEqual({ ok: true });

    as("binu");
    const first = await setOwnMemberPhoto(await photoForm({ organisationSlug: org.slug, memberId: members.asha! }));
    expect(first.ok).toBe(true);
    const firstKey = await keyOf(members.binu!);
    expect(firstKey).toMatch(new RegExp(`^organisations/${org.id}/members/${members.binu}/photo-`));
    // A member id in the form is ignored: the record comes from the account's verified email.
    expect(await keyOf(members.asha!)).not.toBe(firstKey);

    const replaced = await setOwnMemberPhoto(await photoForm({ organisationSlug: org.slug }));
    expect(replaced.ok).toBe(true);
    expect(await keyOf(members.binu!)).not.toBe(firstKey);
    expect(await prisma.asset.findUnique({ where: { key: firstKey! } })).toBeNull();
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "MEMBER_PHOTO_UPLOADED", actorUserId: users.binu!.id } })).toBe(2);

    as("unverified");
    expect(await setOwnMemberPhoto(await photoForm({ organisationSlug: org.slug }))).toMatchObject({ ok: false, error: "We couldn't find that membership on your account." });
    as(null);
    expect(await setOwnMemberPhoto(await photoForm({ organisationSlug: org.slug }))).toMatchObject({ ok: false });
  });

  it("moves photos from the old layout once, keeping their id, and is safe to run again", async () => {
    const old = await legacyPhoto(members.unverified!);
    const id = /member-id-photos\/([0-9a-f-]{36})\.webp$/.exec(old)![1]!;
    const target = memberPhotoKey(org.id, members.unverified!, id);
    // A pass cut off after the copy: the new object already exists.
    await prisma.asset.create({ data: { key: target, contentType: "image/webp", byteSize: BigInt(4), provider: "database", fileData: new Uint8Array([1, 2, 3, 4]), organisationId: org.id } });
    // A photo whose file is gone is cleared rather than retried for ever.
    await prisma.member.update({ where: { id: members.asha! }, data: { photoUrl: `/api/uploads/organisations/${org.id}/member-id-photos/${randomUUID()}.webp` } });

    for (let pass = 0; pass < 10 && (await prisma.member.count({ where: { organisationId: org.id, photoUrl: { contains: "/member-id-photos/" } } })); pass += 1) await migrateMemberPhotos(50);
    expect(await keyOf(members.unverified!)).toBe(target);
    expect(Buffer.from((await prisma.asset.findUniqueOrThrow({ where: { key: target } })).fileData!)).toEqual(Buffer.from([1, 2, 3, 4]));
    // The old file's deletion was queued with the new URL, so a pass that stops here still deletes it later.
    const jobs = await prisma.outboxMessage.findMany({ where: { kind: "legacy-photo-purge", payload: { path: ["organisationId"], equals: org.id } } });
    expect(jobs.map((job) => job.payload)).toContainEqual({ organisationId: org.id, keys: [old] });
    expect(await prisma.asset.findUnique({ where: { key: old } })).not.toBeNull();
    for (const job of jobs) expect(await OUTBOX_KINDS["legacy-photo-purge"].deliver(job.payload, "test")).toBe("sent");
    expect(await prisma.asset.findUnique({ where: { key: old } })).toBeNull();
    // Only this organisation's old-layout photos can be named in the job.
    await expect(OUTBOX_KINDS["legacy-photo-purge"].deliver({ organisationId: org.id, keys: [target] }, "test")).rejects.toThrow();
    await prisma.outboxMessage.deleteMany({ where: { id: { in: jobs.map((job) => job.id) } } });
    expect((await prisma.member.findUniqueOrThrow({ where: { id: members.asha! } })).photoUrl).toBeNull();

    const before = await prisma.asset.findMany({ where: { organisationId: org.id }, orderBy: { key: "asc" }, select: { key: true } });
    await migrateMemberPhotos(50);
    expect(await keyOf(members.unverified!)).toBe(target);
    expect(await prisma.asset.findMany({ where: { organisationId: org.id }, orderBy: { key: "asc" }, select: { key: true } })).toEqual(before);
  });

  it("erasure deletes everything under the member's prefix and nobody else's photos", async () => {
    const prefix = `organisations/${org.id}/members/${members.binu}/`;
    await prisma.asset.create({ data: { key: memberPhotoKey(org.id, members.binu!), contentType: "image/webp", provider: "database", fileData: new Uint8Array([9]), organisationId: org.id } });
    expect(await prisma.asset.count({ where: { key: { startsWith: prefix } } })).toBe(2);
    const otherKey = await keyOf(members.unverified!);
    const request = await prisma.erasureRequest.create({ data: { organisationId: org.id, memberId: members.binu!, requestedByUserId: users.binu!.id, reason: "Please erase me" } });

    as("owner");
    expect(await decideErasureRequest({ organisationSlug: org.slug, requestId: request.id, decision: "approve" })).toEqual({ ok: true });
    // The files go from the outbox job committed with the erasure, which retries until storage agrees.
    const job = await prisma.outboxMessage.findFirstOrThrow({ where: { kind: "member-photo-purge", payload: { path: ["memberId"], equals: members.binu! } } });
    expect(job.payload).toEqual({ organisationId: org.id, memberId: members.binu, keys: [expect.stringContaining(prefix)] });
    expect(await prisma.asset.count({ where: { key: { startsWith: prefix } } })).toBe(2);
    expect(await OUTBOX_KINDS["member-photo-purge"].deliver(job.payload, "test")).toBe("sent");
    await prisma.outboxMessage.delete({ where: { id: job.id } });
    expect(await prisma.asset.count({ where: { key: { startsWith: prefix } } })).toBe(0);
    expect((await prisma.member.findUniqueOrThrow({ where: { id: members.binu! } })).photoUrl).toBeNull();
    expect(await prisma.asset.findUnique({ where: { key: otherKey! } })).not.toBeNull();
  });

  it("leaves the photo purge to be retried while storage fails, and gives up on a bad payload", async () => {
    // Stored in an object store this instance can't reach: the job throws, so the outbox tries again later.
    const key = `organisations/${org.id}/member-id-photos/${randomUUID()}.webp`;
    await prisma.asset.create({ data: { key, contentType: "image/webp", provider: "s3", organisationId: org.id } });
    const purge = OUTBOX_KINDS["member-photo-purge"];
    await expect(purge.deliver({ organisationId: org.id, memberId: members.asha!, keys: [key] }, "test")).rejects.toThrow("not configured");
    expect(await prisma.asset.findUnique({ where: { key } })).not.toBeNull();
    await expect(purge.deliver({ organisationId: "../elsewhere", memberId: members.asha!, keys: [] }, "test")).rejects.toBeInstanceOf(PermanentOutboxError);
  });
});
