import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { buildDigest, queueMonthlyDigests } from "@/lib/reports/digest";
import { addStaff } from "../helpers/staff";

const suffix = randomUUID().slice(0, 8);
let orgId = "";
const users: string[] = [];

beforeAll(async () => {
  const org = await prisma.organisation.create({ data: { name: "Tinkerspace", slug: `tinkerspace-${suffix}`, status: "ACTIVE", createdAt: new Date("2026-01-05T00:00:00Z") } });
  orgId = org.id;
  for (const [role, digest] of [["OWNER", true], ["TREASURER", false], ["VIEWER", true]] as const) {
    const user = await prisma.user.create({ data: { email: `${role.toLowerCase()}-${suffix}@example.test`, name: `${role} Person`, emailVerified: new Date() } });
    users.push(user.id);
    await prisma.teamMember.update({ where: { id: (await addStaff(org.id, user.id, role)).id }, data: { reportDigest: digest } });
  }
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'organisationId' = ${orgId}`;
  await prisma.organisation.delete({ where: { id: orgId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe.sequential("monthly report digest", () => {
  it("queues one email per opted-in owner, manager or treasurer, once per month", async () => {
    const now = new Date("2026-10-01T04:00:00Z");
    await queueMonthlyDigests(now, true);
    await queueMonthlyDigests(now, true);
    const queued = await prisma.$queryRaw<Array<{ payload: { userId: string; month: string } }>>`SELECT "payload" FROM "OutboxMessage" WHERE "kind" = 'report-digest' AND "payload"->>'organisationId' = ${orgId}`;
    expect(queued).toHaveLength(1);
    expect(queued[0].payload).toMatchObject({ userId: users[0], month: "2026-09" });
  });

  it("builds last month's figures, and drops people who switched it off", async () => {
    const digest = await buildDigest({ organisationId: orgId, userId: users[0], month: "2026-09" }, new Date("2026-10-01T04:00:00Z"));
    expect(digest).toMatchObject({ monthLabel: "September 2026", unitName: null, waitingForApproval: 0 });
    expect(digest?.membership.activeEnd).toBe(0);
    expect(digest?.money).not.toBeNull();
    expect(await buildDigest({ organisationId: orgId, userId: users[1], month: "2026-09" })).toBeNull();
    expect(await buildDigest({ organisationId: orgId, userId: users[2], month: "2026-09" })).toBeNull();
  });
});
