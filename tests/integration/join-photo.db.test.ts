import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/storage/client", () => ({ storageConfigured: () => false }));
vi.mock("@/lib/storage", async (original) => {
  const actual = await original<typeof import("@/lib/storage")>();
  return { ...actual, uploadFile: vi.fn(actual.uploadFile) };
});

import { prisma } from "@/lib/db";
import { submitJoin } from "@/app/actions/join";
import { uploadFile } from "@/lib/storage";
import { memberPhotoPrefix } from "@/lib/storage/memberPhotos";
import { uploadKeyFromUrl } from "@/lib/uploadUrl";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const slug = `join-photo-${suffix}`;
const userIds: string[] = [];
let orgId = "";
let image: File;

async function signInNew() {
  const user = await prisma.user.create({ data: { email: `joiner-${randomUUID()}@example.test`, emailVerified: new Date(), name: "Joiner" } });
  userIds.push(user.id);
  identity.current = { id: user.id, email: user.email! };
  return user.email!;
}

function join(planSlug: string, photo?: File, extra: Record<string, unknown> = {}) {
  const form = new FormData();
  form.set("payload", JSON.stringify({ organisationSlug: slug, planSlug, consent: true, profile: { name: "Photo Joiner" }, ...extra }));
  if (photo) form.set("photo", photo);
  return submitJoin(form);
}

const memberFor = (email: string) => prisma.member.findUnique({ where: { organisationId_email: { organisationId: orgId, email } }, include: { terms: true } });

beforeAll(async () => {
  const org = await prisma.organisation.create({ data: { name: "Join photo", slug, status: "ACTIVE", memberPhotoUpload: true } });
  orgId = org.id;
  await prisma.membershipPlan.createMany({
    data: [
      { organisationId: orgId, name: "Required", slug: "required", joinMode: "OPEN", joinPhoto: "REQUIRED" },
      { organisationId: orgId, name: "Optional", slug: "optional", joinMode: "OPEN", joinPhoto: "OPTIONAL" },
      { organisationId: orgId, name: "Off", slug: "off", joinMode: "OPEN" },
    ],
  });
  const png = await sharp({ create: { width: 80, height: 80, channels: 3, background: "teal" } }).png().toBuffer();
  image = new File([new Uint8Array(png)], "photo.png", { type: "image/png" });
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${orgId}`;
  await prisma.asset.deleteMany({ where: { organisationId: orgId } });
  await prisma.organisation.deleteMany({ where: { id: orgId } });
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe.sequential("a photo on the join form", () => {
  it("refuses a required photo that is missing, writing nothing", async () => {
    const email = await signInNew();
    expect(await join("required")).toMatchObject({ ok: false, fieldErrors: { photo: ["Add a photo"] } });
    expect(await memberFor(email)).toBeNull();
  });

  it("refuses a malformed image before any member or membership is written", async () => {
    const email = await signInNew();
    const broken = new File([new Uint8Array(Buffer.from("not really a png"))], "photo.png", { type: "image/png" });
    expect(await join("optional", broken)).toMatchObject({ ok: false, fieldErrors: { photo: [expect.any(String)] } });
    expect(await memberFor(email)).toBeNull();
    expect(await prisma.membershipTerm.count({ where: { organisationId: orgId, member: { email } } })).toBe(0);
  });

  it("refuses a file when the plan takes no photo", async () => {
    const email = await signInNew();
    expect(await join("off", image)).toMatchObject({ ok: false, fieldErrors: { photo: ["This plan doesn't take a photo"] } });
    expect(await memberFor(email)).toBeNull();
  });

  it("stores a valid photo under the joining member's own prefix and audits it, ignoring a crafted member id", async () => {
    const other = await prisma.member.create({ data: { organisationId: orgId, email: `other-${suffix}@example.test`, name: "Someone else", memberNumber: 9001, source: "MANUAL" } });
    const email = await signInNew();
    const result = await join("required", image, { memberId: other.id, profile: { name: "Photo Joiner", memberId: other.id } });
    expect(result).toMatchObject({ ok: true, data: { status: "ACTIVE", warning: null } });
    const member = (await memberFor(email))!;
    expect(uploadKeyFromUrl(member.photoUrl!)).toMatch(new RegExp(`^${memberPhotoPrefix(orgId, member.id)}`));
    expect((await prisma.member.findUniqueOrThrow({ where: { id: other.id } })).photoUrl).toBeNull();
    expect(await prisma.auditEvent.findFirst({ where: { organisationId: orgId, targetId: member.id, action: "MEMBER_PHOTO_UPLOADED" } })).toMatchObject({ metadata: { by: "join" } });
  });

  it("never replaces an existing photo, and a required photo is met by it", async () => {
    const email = await signInNew();
    expect(await join("optional", image)).toMatchObject({ ok: true });
    const before = (await memberFor(email))!.photoUrl;
    expect(before).not.toBeNull();
    expect(await join("required")).toMatchObject({ ok: true });
    expect((await memberFor(email))!.photoUrl).toBe(before);
  });

  it("an existing photo is kept when another one is uploaded through joining", async () => {
    const email = await signInNew();
    expect(await join("optional", image)).toMatchObject({ ok: true });
    const before = (await memberFor(email))!;
    vi.mocked(uploadFile).mockClear();
    expect(await join("required", image)).toMatchObject({ ok: true, data: { warning: null } });
    expect((await memberFor(email))!.photoUrl).toBe(before.photoUrl);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("returns success with a warning when storage fails after the join commits", async () => {
    const email = await signInNew();
    vi.mocked(uploadFile).mockRejectedValueOnce(new Error("storage down"));
    const result = await join("optional", image);
    expect(result).toMatchObject({ ok: true, data: { status: "ACTIVE", warning: "You've joined, but we couldn't save your photo. Add it from your account." } });
    const member = (await memberFor(email))!;
    expect(member.photoUrl).toBeNull();
    expect(member.terms).toHaveLength(1);
  });

  it("holds the new card's email while the photo uploads, then lets it go", async () => {
    const email = await signInNew();
    const cardEmailDue = async () => {
      const member = await prisma.member.findUniqueOrThrow({ where: { organisationId_email: { organisationId: orgId, email } } });
      const card = await prisma.memberCard.findFirstOrThrow({ where: { memberId: member.id, revokedAt: null } });
      return (await prisma.outboxMessage.findFirstOrThrow({ where: { kind: "member-card", payload: { path: ["cardId"], equals: card.id } } })).availableAt;
    };
    let heldUntil: Date | null = null;
    const actual = vi.mocked(uploadFile).getMockImplementation()!;
    vi.mocked(uploadFile).mockImplementationOnce(async (...args) => {
      heldUntil = await cardEmailDue();
      return actual(...args);
    });
    expect(await join("optional", image)).toMatchObject({ ok: true, data: { status: "ACTIVE" } });
    expect(heldUntil!.getTime()).toBeGreaterThan(Date.now() + 60_000);
    expect((await cardEmailDue()).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
