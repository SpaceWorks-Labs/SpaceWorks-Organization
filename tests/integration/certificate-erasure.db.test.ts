import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { upsertMember } from "@/lib/membership/service";
import { decideErasureRequest } from "@/app/actions/erasure";
import { lookupCertificateVerification } from "@/lib/certificates/verifyLookup";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
let orgId = "";
let slug = "";
let ownerId = "";
let memberId = "";
let designId = "";

beforeAll(async () => {
  const org = await prisma.organisation.create({ data: { name: "Erasure Club", slug: `cert-erase-${suffix}`, status: "ACTIVE", memberPortal: true } });
  [orgId, slug] = [org.id, org.slug];
  const owner = await prisma.user.create({ data: { email: `owner-${suffix}@example.test`, emailVerified: new Date(), mfaEnabledAt: new Date() } });
  ownerId = owner.id;
  await addStaff(orgId, ownerId, "OWNER");
  memberId = (await prisma.$transaction((tx) => upsertMember(tx, orgId, { email: `chitra-${suffix}@example.test`, name: "Chitra Nair", source: "JOIN_FORM" }))).id;
  designId = (await prisma.certificateDesign.create({ data: { organisationId: orgId, name: "Thanks", typeLabel: "Thanks", numberPrefix: "TH" } })).id;
  identity.current = { id: ownerId };
});

afterAll(async () => {
  await prisma.organisation.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
});

describe("erasure", () => {
  it("clears the citation and the revoke reason of an erased member's certificates but keeps the rows", async () => {
    const base = { organisationId: orgId, designId, memberId, title: "Thanks" };
    const token = (letter: string) => randomUUID().replace(/-/g, "") + letter.repeat(11);
    const valid = await prisma.certificate.create({ data: { ...base, certificateNumber: "TH-0001", verifyToken: token("a"), reason: "For Chitra's work on the flood relief" } });
    const revoked = await prisma.certificate.create({ data: { ...base, certificateNumber: "TH-0002", verifyToken: token("b"), reason: "x", revokedAt: new Date(), revokedReason: "Chitra asked us to take it back" } });
    const request = await prisma.erasureRequest.create({ data: { organisationId: orgId, memberId, requestedByUserId: ownerId, reason: "Leaving" } });
    expect(await decideErasureRequest({ organisationSlug: slug, requestId: request.id, decision: "approve" })).toEqual({ ok: true });
    const rows = await prisma.certificate.findMany({ where: { id: { in: [valid.id, revoked.id] } }, orderBy: { certificateNumber: "asc" } });
    expect(rows.map((row) => [row.reason, row.revokedReason])).toEqual([[null, null], [null, "Removed on erasure"]]);
    expect(await lookupCertificateVerification(valid.verifyToken)).toEqual({ state: "not-found" });
  });
});
