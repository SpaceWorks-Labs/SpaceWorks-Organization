import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addStaff, starterRole } from "../helpers/staff";

const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
let organisationId: string;
let userId: string;

describe.sequential("production database invariants", () => {
  beforeAll(async () => {
    const organisation = await prisma.organisation.create({
      data: { name: "Schema invariant org", slug: `schema-invariants-${suffix}` },
    });
    organisationId = organisation.id;
    userId = (await prisma.user.create({ data: { email: `schema-user-${suffix}@example.test` } })).id;
  });

  afterAll(async () => {
    if (organisationId) await prisma.organisation.deleteMany({ where: { id: organisationId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("rejects malformed organisation addresses, months, limits and currencies", async () => {
    const make = (data: Record<string, unknown>) =>
      prisma.organisation.create({ data: { name: "Bad", slug: `bad-${suffix}`, ...data } });
    await expect(make({ slug: `Bad_Slug_${suffix}` })).rejects.toThrow();
    await expect(make({ financialYearStartMonth: 13 })).rejects.toThrow();
    await expect(make({ financialYearStartMonth: 0 })).rejects.toThrow();
    await expect(make({ memberLimit: 0 })).rejects.toThrow();
    await expect(make({ managerLimit: -1 })).rejects.toThrow();
    await expect(make({ currency: "inr" })).rejects.toThrow();
  });

  it("allows one team row per person per organisation", async () => {
    await addStaff(organisationId, userId, "OWNER");
    await expect(addStaff(organisationId, userId, "VIEWER")).rejects.toThrow();
  });

  it("requires a note on refusals and change requests", async () => {
    await expect(prisma.organisationReview.create({ data: { organisationId, action: "REJECTED" } })).rejects.toThrow();
    await expect(prisma.organisationReview.create({ data: { organisationId, action: "CHANGES_REQUESTED", reason: "   " } })).rejects.toThrow();
    await expect(prisma.organisationReview.create({ data: { organisationId, action: "CHANGES_REQUESTED", reason: "Add your address" } })).resolves.toBeTruthy();
    await expect(prisma.organisationReview.create({ data: { organisationId, action: "APPROVED" } })).resolves.toBeTruthy();
  });

  it("records who used an invite only together with when", async () => {
    const roleId = (await starterRole(organisationId, "VIEWER")).id;
    await expect(prisma.teamInvite.create({ data: { organisationId, roleId, token: `t-${suffix}-1`, usedByUserId: userId } })).rejects.toThrow();
    await expect(prisma.teamInvite.create({ data: { organisationId, roleId, token: `t-${suffix}-2`, usedByUserId: userId, usedAt: new Date() } })).resolves.toBeTruthy();
  });

  it("rejects impossible outbox states and negative attempts", async () => {
    await expect(prisma.outboxMessage.create({ data: { kind: "organisation-notice", payload: {}, status: "SENT", sentAt: null } })).rejects.toThrow();
    await expect(prisma.outboxMessage.create({ data: { kind: "organisation-notice", payload: {}, status: "PROCESSING" } })).rejects.toThrow();
    await expect(prisma.outboxMessage.create({ data: { kind: "organisation-notice", payload: {}, attempts: -1 } })).rejects.toThrow();
  });

  it("removes an organisation's team, invites and review history with it", async () => {
    const org = await prisma.organisation.create({ data: { name: "Cascade", slug: `cascade-${suffix}` } });
    await addStaff(org.id, userId, "OWNER");
    await prisma.teamInvite.create({ data: { organisationId: org.id, roleId: (await starterRole(org.id, "VIEWER")).id, token: `cascade-${suffix}` } });
    await prisma.organisationReview.create({ data: { organisationId: org.id, action: "SUBMITTED" } });
    await prisma.organisation.delete({ where: { id: org.id } });
    expect(await prisma.teamMember.count({ where: { organisationId: org.id } })).toBe(0);
    expect(await prisma.teamInvite.count({ where: { organisationId: org.id } })).toBe(0);
    expect(await prisma.organisationReview.count({ where: { organisationId: org.id } })).toBe(0);
  });
});
