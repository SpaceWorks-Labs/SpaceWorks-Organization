import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: identity.id } }) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/storage/client", () => ({ storageConfigured: () => false }));
vi.mock("@/lib/storage", async (original) => {
  const actual = await original<typeof import("@/lib/storage")>();
  return { ...actual, uploadFile: vi.fn(actual.uploadFile) };
});

import { prisma } from "@/lib/db";
import { upsertMember } from "@/lib/membership/service";
import { setMemberPhoto } from "@/app/actions/member-photo";
import { prepareMemberPhoto, replaceMemberPhoto, type PreparedMemberPhoto } from "@/lib/membership/photo";
import { memberPhotoPrefix } from "@/lib/storage/memberPhotos";
import { uploadFile } from "@/lib/storage";
import { uploadKeyFromUrl } from "@/lib/uploadUrl";
import { addStaff } from "../helpers/staff";

const realUpload = vi.mocked(uploadFile).getMockImplementation()!;
let org: { id: string; slug: string };
let image: File;
let prepared: PreparedMemberPhoto;
const current = (id: string) => prisma.member.findUniqueOrThrow({ where: { id } });
const assets = (id: string) => prisma.asset.findMany({ where: { key: { startsWith: memberPhotoPrefix(org.id, id) } } });
const newMember = () => prisma.$transaction((tx) => upsertMember(tx, org.id, { name: "Photo member", email: randomUUID() + "@example.test", source: "JOIN_FORM" }));

beforeAll(async () => {
  org = await prisma.organisation.create({ data: { name: "Photo lifecycle", slug: "photo-life-" + randomUUID(), status: "ACTIVE" } });
  const user = await prisma.user.create({ data: { email: randomUUID() + "@example.test", emailVerified: new Date(), mfaEnabledAt: new Date() } });
  identity.id = user.id;
  await addStaff(org.id, user.id, "OWNER");
  const png = await sharp({ create: { width: 80, height: 80, channels: 3, background: "blue" } }).png().toBuffer();
  image = new File([new Uint8Array(png)], "photo.png", { type: "image/png" });
  const result = await prepareMemberPhoto(image);
  if ("error" in result) throw new Error(result.error);
  prepared = result;
});

beforeEach(() => {
  vi.mocked(uploadFile).mockImplementation(realUpload);
});
afterAll(async () => {
  if (org) {
    await prisma.asset.deleteMany({ where: { organisationId: org.id } });
    await prisma.organisation.delete({ where: { id: org.id } });
  }
  if (identity.id) await prisma.user.delete({ where: { id: identity.id } });
  await prisma.$disconnect();
});

describe.sequential("locked member photo attachment", () => {
  it("a staff upload with a stale caller copy deletes the photo attached while it uploaded", async () => {
    const member = await newMember();
    let joinedUrl: string | null = null;
    vi.mocked(uploadFile).mockImplementationOnce(async (input) => {
      const uploaded = await realUpload(input);
      const joined = await replaceMemberPhoto(member, prepared, { onlyIfEmpty: true });
      if ("error" in joined) throw new Error(joined.error);
      joinedUrl = joined.url;
      return uploaded;
    });
    const form = new FormData();
    form.set("organisationSlug", org.slug);
    form.set("memberId", member.id);
    form.set("file", image);
    const result = await setMemberPhoto(form);
    expect(result.ok).toBe(true);
    const saved = await current(member.id);
    expect(saved.photoUrl).not.toBe(joinedUrl);
    expect(await assets(member.id)).toEqual([expect.objectContaining({ key: uploadKeyFromUrl(saved.photoUrl!) })]);
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, targetId: member.id, action: "MEMBER_PHOTO_UPLOADED" } })).toBe(1);
  });

  it("onlyIfEmpty re-reads the existing photo and deletes the unused upload", async () => {
    const stale = await newMember();
    const first = await replaceMemberPhoto(stale, prepared);
    expect(first).not.toHaveProperty("error");
    const result = await replaceMemberPhoto(stale, prepared, { onlyIfEmpty: true });
    expect(result).toEqual({ ...first, kept: true });
    expect((await current(stale.id)).photoUrl).toBe((first as { url: string }).url);
    expect(await assets(stale.id)).toHaveLength(1);
  });

  it("refuses attachment after anonymisation during upload and discards the new object", async () => {
    const member = await newMember();
    vi.mocked(uploadFile).mockImplementationOnce(async (input) => {
      const uploaded = await realUpload(input);
      await prisma.member.update({ where: { id: member.id }, data: { anonymisedAt: new Date(), photoUrl: null } });
      return uploaded;
    });
    expect(await replaceMemberPhoto(member, prepared, { onlyIfEmpty: true })).toEqual({ error: "Member not found." });
    expect((await current(member.id)).photoUrl).toBeNull();
    expect(await assets(member.id)).toHaveLength(0);
    expect(await replaceMemberPhoto(member, null)).toHaveProperty("error");
  });

  it("scopes the row lock by organisation as well as member id", async () => {
    const member = await newMember();
    expect(await replaceMemberPhoto({ ...member, organisationId: "another-org" }, null)).toHaveProperty("error");
    expect((await current(member.id)).photoUrl).toBeNull();
  });

  it("removes the current photo even when the caller's copy is stale", async () => {
    const member = await newMember();
    await replaceMemberPhoto(member, prepared);
    expect(await replaceMemberPhoto(member, null)).toEqual({ url: null });
    expect(await assets(member.id)).toHaveLength(0);
  });
});
