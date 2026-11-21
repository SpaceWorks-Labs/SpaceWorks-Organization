import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { decideTerm, openTerm, upsertMember } from "@/lib/membership/service";
import { approveCertificateDesign, createCertificateDesign, deleteCertificateDesign, discardCertificateDraft, saveCertificateDesign } from "@/app/actions/certificate-designs";
import { emailIssuedCertificate, issueCertificates, revokeIssuedCertificate, searchCertificateRecipients } from "@/app/actions/certificates";
import { authorizeCertificateAccess } from "@/lib/certificates/access";
import { loadCertificateForRender } from "@/lib/certificates/data";
import { renderCertificate } from "@/lib/certificates/render";
import { listCertificatesForUser } from "@/lib/certificates/portal";
import { lookupCertificateVerification } from "@/lib/certificates/verifyLookup";
import { staffCertificateScanAccess } from "@/lib/certificates/staffScan";
import { GET as downloadOne } from "@/app/api/certificates/[certificateId]/route";
import { GET as downloadMany } from "@/app/api/exports/certificates/[orgSlug]/route";
import { readZip } from "@/lib/cards/zip";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const users: Record<string, string> = {};
const emails: Record<string, string> = {};
const units: Record<string, string> = {};
const members: Record<string, string> = {};
let org: { id: string; slug: string; timezone: string; financialYearStartMonth: number };
let other: { id: string; slug: string };
let plan: Awaited<ReturnType<typeof prisma.membershipPlan.create>>;
let designId = "";
let otherDesignId = "";
const issued: Record<string, string> = {};

const as = (key: string | null) => {
  identity.current = key ? { id: users[key]! } : null;
};
const slug = () => org.slug;
const ok = <T>(result: { ok: boolean } & Record<string, unknown>) => {
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  return (result as unknown as { ok: true; data: T }).data;
};
const failed = (result: { ok: boolean; error?: string }) => {
  expect(result.ok).toBe(false);
  return result.error;
};
const fileRequest = (path: string) => new Request(`http://localhost${path}`);

beforeAll(async () => {
  const created = await prisma.organisation.create({ data: { name: "Certificates Club", slug: `certs-${suffix}`, status: "ACTIVE", memberPortal: true } });
  org = { id: created.id, slug: created.slug, timezone: created.timezone, financialYearStartMonth: created.financialYearStartMonth };
  const foreign = await prisma.organisation.create({ data: { name: "Other Club", slug: `certs-other-${suffix}`, status: "ACTIVE" } });
  other = { id: foreign.id, slug: foreign.slug };
  plan = await prisma.membershipPlan.create({ data: { organisationId: org.id, name: "Annual", slug: `annual-${suffix}`, currency: "INR", priceNewMinor: 0, priceRenewalMinor: 0, joinMode: "APPROVAL" } });
  for (const key of ["north", "south"]) {
    const unit = await prisma.orgUnit.create({ data: { organisationId: org.id, name: key, slug: key, code: key.toUpperCase(), level: 0, path: "pending" } });
    await prisma.orgUnit.update({ where: { id: unit.id }, data: { path: unit.id } });
    units[key] = unit.id;
  }
  for (const key of ["owner", "manager", "northLead", "treasurer", "outsider", "asha", "binu", "chitra", "stranger", "unverified"]) {
    emails[key] = `${key.toLowerCase()}-${suffix}@example.test`;
    const user = await prisma.user.create({ data: { email: emails[key]!, emailVerified: key === "unverified" ? null : new Date(), mfaEnabledAt: ["asha", "binu", "chitra", "stranger", "unverified"].includes(key) ? null : new Date() } });
    users[key] = user.id;
  }
  await addStaff(org.id, users.owner!, "OWNER");
  await addStaff(org.id, users.manager!, "ADMIN");
  await addStaff(org.id, users.northLead!, "ADMIN", units.north!);
  await addStaff(org.id, users.treasurer!, "TREASURER");
  await addStaff(other.id, users.outsider!, "OWNER");
  for (const [name, unit] of [["Asha Menon", "north"], ["Binu Thomas", "north"], ["Chitra Nair", "south"]] as const) {
    await prisma.$transaction(async (tx) => {
      const key = name.split(" ")[0]!.toLowerCase();
      const member = await upsertMember(tx, org.id, { email: emails[key]!, name, source: "JOIN_FORM" });
      await tx.member.update({ where: { id: member.id }, data: { unitId: units[unit] } });
      members[key] = member.id;
      const term = await openTerm(tx, { org, plan, memberId: member.id, byManager: false, actorUserId: null });
      await decideTerm(tx, { org, termId: term.id, action: "approve", actorUserId: users.owner! });
    });
  }
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${org.id}`;
  await prisma.certificate.deleteMany({ where: { organisationId: { in: [org.id, other.id] } } });
  await prisma.organisation.deleteMany({ where: { id: { in: [org.id, other.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await prisma.$disconnect();
});

describe.sequential("designs and approval", () => {
  it("a manager drafts a design; it cannot issue until the owner approves it", async () => {
    as("manager");
    designId = ok<{ designId: string }>(await createCertificateDesign({ organisationSlug: slug(), name: "Appreciation", typeLabel: "Certificate of appreciation" })).designId;
    const row = await prisma.certificateDesign.findUniqueOrThrow({ where: { id: designId } });
    expect(row.design).toBeNull();
    expect(row.draft).not.toBeNull();
    expect(failed(await issueCertificates({ organisationSlug: slug(), designId, target: { kind: "members", memberIds: [members.asha!] } }))).toMatch(/has not been approved/);
    expect(failed(await approveCertificateDesign({ organisationSlug: slug(), designId }))).toBeTruthy();
    as("northLead");
    expect(failed(await createCertificateDesign({ organisationSlug: slug(), name: "Nope" }))).toMatch(/whole organisation/);
    as("treasurer");
    expect(failed(await createCertificateDesign({ organisationSlug: slug(), name: "Nope" }))).toBeTruthy();
  });

  it("the owner approves; the design is then live with its page and numbering", async () => {
    as("manager");
    ok(await saveCertificateDesign({ organisationSlug: slug(), designId, pageSize: "LETTER", orientation: "PORTRAIT", numberPrefix: "CA", numberFormat: "{PREFIX}-{SEQ:4}" }));
    as("owner");
    ok(await approveCertificateDesign({ organisationSlug: slug(), designId }));
    const row = await prisma.certificateDesign.findUniqueOrThrow({ where: { id: designId } });
    expect([row.pageSize, row.orientation, row.numberPrefix, row.draft]).toEqual(["LETTER", "PORTRAIT", "CA", null]);
    expect(row.design).toMatchObject({ widthMm: 215.9, heightMm: 279.4 });
    expect(failed(await approveCertificateDesign({ organisationSlug: slug(), designId }))).toMatch(/no changes waiting/);
  });

  it("refuses another organisation's design with the same message as a missing one", async () => {
    as("outsider");
    otherDesignId = ok<{ designId: string }>(await createCertificateDesign({ organisationSlug: other.slug, name: "Theirs" })).designId;
    as("manager");
    expect(failed(await saveCertificateDesign({ organisationSlug: slug(), designId: otherDesignId, numberPrefix: "ZZ" }))).toMatch(/no longer exists/);
    expect(failed(await issueCertificates({ organisationSlug: slug(), designId: otherDesignId, target: { kind: "members", memberIds: [members.asha!] } }))).toMatch(/no longer exists/);
    expect(failed(await approveCertificateDesign({ organisationSlug: other.slug, designId }))).toBeTruthy();
  });
});

describe.sequential("issuing", () => {
  it("issues to chosen members with numbers from the design's own series", async () => {
    as("manager");
    const result = ok<{ issued: number; skipped: number; certificateIds: string[] }>(await issueCertificates({ organisationSlug: slug(), designId, title: "Volunteer of the year", reason: "For {member.name} and 100 hours", target: { kind: "members", memberIds: [members.asha!, members.binu!] } }));
    expect([result.issued, result.skipped]).toEqual([2, 0]);
    const rows = await prisma.certificate.findMany({ where: { organisationId: org.id }, orderBy: { certificateNumber: "asc" }, include: { member: true } });
    expect(rows.map((row) => row.certificateNumber)).toEqual(["CA-0001", "CA-0002"]);
    expect(rows.every((row) => /^[A-Za-z0-9_-]{43}$/.test(row.verifyToken) && row.title === "Volunteer of the year")).toBe(true);
    for (const row of rows) issued[row.member.name.split(" ")[0]!.toLowerCase()] = row.id;
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "CERTIFICATE_ISSUED" } })).toBe(2);
  });

  it("skips a member who already holds a valid one with the same title, and uses the type label when no title is typed", async () => {
    as("manager");
    const again = ok<{ issued: number; skipped: number }>(await issueCertificates({ organisationSlug: slug(), designId, title: "Volunteer of the year", target: { kind: "members", memberIds: [members.asha!, members.chitra!] } }));
    expect([again.issued, again.skipped]).toEqual([1, 1]);
    const plain = ok<{ certificateIds: string[] }>(await issueCertificates({ organisationSlug: slug(), designId, target: { kind: "members", memberIds: [members.asha!] } }));
    expect((await prisma.certificate.findUniqueOrThrow({ where: { id: plain.certificateIds[0]! } })).title).toBe("Certificate of appreciation");
    const chitra = await prisma.certificate.findFirstOrThrow({ where: { organisationId: org.id, memberId: members.chitra! } });
    issued.chitra = chitra.id;
  });

  it("limits a manager to their unit: chosen members, a plan and a group never reach outside it", async () => {
    as("northLead");
    expect(failed(await issueCertificates({ organisationSlug: slug(), designId, title: "Scoped", target: { kind: "members", memberIds: [members.asha!, members.chitra!] } }))).toMatch(/can't be found/);
    expect(await prisma.certificate.count({ where: { organisationId: org.id, title: "Scoped" } })).toBe(0);
    const byPlan = ok<{ issued: number }>(await issueCertificates({ organisationSlug: slug(), designId, title: "Scoped", target: { kind: "plan", planId: plan.id } }));
    expect(byPlan.issued).toBe(2);
    expect((await prisma.certificate.findMany({ where: { organisationId: org.id, title: "Scoped" }, select: { member: { select: { unitId: true } } } })).every((row) => row.member.unitId === units.north)).toBe(true);
    const group = await prisma.smartGroup.create({ data: { organisationId: org.id, name: "Everyone", condition: { type: "and", items: [{ type: "status", statuses: ["ACTIVE", "GRACE"] }] } } });
    const byGroup = ok<{ issued: number; skipped: number }>(await issueCertificates({ organisationSlug: slug(), designId, title: "Scoped", target: { kind: "group", groupId: group.id } }));
    expect([byGroup.issued, byGroup.skipped]).toEqual([0, 2]);
    expect((await searchCertificateRecipients({ organisationSlug: slug(), query: "a" }) as { data: { members: Array<{ name: string }> } }).data.members.map((member) => member.name).sort()).toEqual(["Asha Menon", "Binu Thomas"]);
  });

  it("refuses staff without the permission and members of another organisation", async () => {
    as("treasurer");
    expect(failed(await issueCertificates({ organisationSlug: slug(), designId, target: { kind: "plan", planId: plan.id } }))).toBeTruthy();
    as("outsider");
    expect(failed(await issueCertificates({ organisationSlug: other.slug, designId, target: { kind: "members", memberIds: [members.asha!] } }))).toBeTruthy();
    expect(failed(await revokeIssuedCertificate({ organisationSlug: other.slug, certificateId: issued.asha!, reason: "x" }))).toMatch(/not found/i);
  });

  it("queues an email once per ten minutes", async () => {
    as("manager");
    ok(await emailIssuedCertificate({ organisationSlug: slug(), certificateId: issued.binu! }));
    expect(failed(await emailIssuedCertificate({ organisationSlug: slug(), certificateId: issued.binu! }))).toMatch(/few minutes/);
    expect(await prisma.outboxMessage.count({ where: { kind: "certificate-email", payload: { path: ["certificateId"], equals: issued.binu! } } })).toBe(1);
    as("northLead");
    expect(failed(await emailIssuedCertificate({ organisationSlug: slug(), certificateId: issued.chitra! }))).toMatch(/not found/i);
  });
});

describe.sequential("drafts never reach issued certificates", () => {
  it("renders the live design while a changed draft waits", async () => {
    as("manager");
    const before = await loadCertificateForRender(issued.asha!);
    expect(before!.input.side.layers.length).toBeGreaterThan(5);
    ok(await saveCertificateDesign({ organisationSlug: slug(), designId, design: { layers: [{ id: "ltext1", kind: "text", text: "DRAFT ONLY", wMm: 100, hMm: 10 }] }, typeLabel: "Draft label" }));
    const after = await loadCertificateForRender(issued.asha!);
    expect(after!.input.side.layers.map((layer) => layer.id)).toEqual(before!.input.side.layers.map((layer) => layer.id));
    expect(JSON.stringify(after!.input.side)).not.toContain("DRAFT ONLY");
    expect(after!.input.values).toMatchObject({ memberName: "Asha Menon", title: "Volunteer of the year", certificateNumber: "CA-0001" });
    const pdf = await renderCertificate(after!.input, "pdf", "Test");
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    const png = await renderCertificate(after!.input, "png", "Test");
    expect(Buffer.from(png).subarray(1, 4).toString()).toBe("PNG");
    ok(await discardCertificateDraft({ organisationSlug: slug(), designId }));
    expect((await prisma.certificateDesign.findUniqueOrThrow({ where: { id: designId } })).draft).toBeNull();
  });
});

describe.sequential("downloads", () => {
  const one = (id: string, query = "format=pdf") => downloadOne(fileRequest(`/api/certificates/${id}?${query}`), { params: Promise.resolve({ certificateId: id }) });
  const many = (query: string, orgSlug = org.slug) => downloadMany(fileRequest(`/api/exports/certificates/${orgSlug}?${query}`), { params: Promise.resolve({ orgSlug }) });

  it("lets the member and in-scope staff download, and nobody else", async () => {
    as("asha");
    expect(await authorizeCertificateAccess(issued.asha!)).toEqual({ userId: users.asha, as: "member" });
    expect((await one(issued.asha!)).status).toBe(200);
    expect((await one(issued.binu!)).status).toBe(404);
    as("northLead");
    expect(await authorizeCertificateAccess(issued.asha!)).toMatchObject({ as: "team" });
    expect(await authorizeCertificateAccess(issued.chitra!)).toBeNull();
    as("stranger");
    expect(await authorizeCertificateAccess(issued.asha!)).toBeNull();
    as("unverified");
    expect((await one(issued.asha!)).status).toBe(404);
    as("outsider");
    expect((await one(issued.asha!)).status).toBe(404);
    as(null);
    expect((await one(issued.asha!)).status).toBe(404);
  });

  it("downloads a design's valid certificates as a ZIP inside the requester's reach", async () => {
    as("northLead");
    const north = readZip(Buffer.from(await (await many(`design=${designId}&format=zip`)).arrayBuffer()));
    expect(north.length).toBe(5);
    as("manager");
    const all = await many(`design=${designId}&format=zip`);
    expect(all.headers.get("content-type")).toBe("application/zip");
    expect(readZip(Buffer.from(await all.arrayBuffer())).length).toBe(6);
    const pdf = await many(`design=${designId}&format=pdf`);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    as("treasurer");
    expect((await many(`design=${designId}&format=zip`)).status).toBe(403);
    as("outsider");
    expect((await many(`design=${designId}&format=zip`)).status).toBe(404);
    expect((await many(`design=${otherDesignId}&format=zip`, other.slug)).status).toBe(404);
  });
});

describe.sequential("revoking, checking and the portal", () => {
  it("shows a valid certificate publicly and in the portal", async () => {
    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: issued.asha! } });
    expect(await lookupCertificateVerification(row.verifyToken)).toMatchObject({ state: "certificate", verdict: "valid", memberName: "Asha Menon", title: "Volunteer of the year" });
    expect(await lookupCertificateVerification("x".repeat(43))).toEqual({ state: "not-found" });
    expect(await lookupCertificateVerification("short")).toEqual({ state: "not-found" });
    expect((await listCertificatesForUser(users.asha!)).map((item) => item.id).sort()).toEqual((await prisma.certificate.findMany({ where: { memberId: members.asha! }, select: { id: true } })).map((item) => item.id).sort());
    expect(await listCertificatesForUser(users.stranger!)).toEqual([]);
    expect(await listCertificatesForUser(users.unverified!)).toEqual([]);
    expect((await listCertificatesForUser(users.binu!)).every((item) => item.number.startsWith("CA-"))).toBe(true);
  });

  it("scans for staff in reach only", async () => {
    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: issued.chitra! } });
    as("northLead");
    expect(await staffCertificateScanAccess(row.verifyToken)).toBeNull();
    as("manager");
    expect(await staffCertificateScanAccess(row.verifyToken)).toMatchObject({ certificate: { state: "valid" }, authenticator: true });
    as("outsider");
    expect(await staffCertificateScanAccess(row.verifyToken)).toBeNull();
  });

  it("revokes with a reason, once, and then hides the holder and the portal copy", async () => {
    as("manager");
    expect(failed(await revokeIssuedCertificate({ organisationSlug: slug(), certificateId: issued.asha!, reason: "" }))).toBeTruthy();
    ok(await revokeIssuedCertificate({ organisationSlug: slug(), certificateId: issued.asha!, reason: "Issued in error" }));
    expect(failed(await revokeIssuedCertificate({ organisationSlug: slug(), certificateId: issued.asha!, reason: "Again" }))).toMatch(/already revoked/);
    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: issued.asha! } });
    expect([row.revokedReason, row.revokedById]).toEqual(["Issued in error", users.manager]);
    expect(await lookupCertificateVerification(row.verifyToken)).toMatchObject({ state: "certificate", verdict: "revoked", memberName: null });
    expect((await listCertificatesForUser(users.asha!)).some((item) => item.id === issued.asha)).toBe(false);
    as("asha");
    expect(await authorizeCertificateAccess(issued.asha!)).toBeNull();
    as("manager");
    expect(await authorizeCertificateAccess(issued.asha!)).toMatchObject({ as: "team" });
    expect(await prisma.auditEvent.count({ where: { organisationId: org.id, action: "CERTIFICATE_REVOKED" } })).toBe(1);
    // A revoked certificate no longer blocks issuing the same title again.
    const again = ok<{ issued: number }>(await issueCertificates({ organisationSlug: slug(), designId, title: "Volunteer of the year", target: { kind: "members", memberIds: [members.asha!] } }));
    expect(again.issued).toBe(1);
  });

  it("deletes a design nothing was issued from and archives one that has certificates", async () => {
    as("manager");
    expect(ok<{ archived: boolean }>(await deleteCertificateDesign({ organisationSlug: slug(), designId })).archived).toBe(true);
    expect((await prisma.certificateDesign.findUniqueOrThrow({ where: { id: designId } })).archivedAt).not.toBeNull();
    expect(failed(await issueCertificates({ organisationSlug: slug(), designId, target: { kind: "members", memberIds: [members.binu!] } }))).toMatch(/archived/);
    const second = ok<{ designId: string }>(await createCertificateDesign({ organisationSlug: slug(), name: "Scratch" })).designId;
    expect(ok<{ archived: boolean }>(await deleteCertificateDesign({ organisationSlug: slug(), designId: second })).archived).toBe(false);
    expect(await prisma.certificateDesign.count({ where: { id: second } })).toBe(0);
  });
});
