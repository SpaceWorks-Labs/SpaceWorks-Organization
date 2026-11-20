import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

const CHANNEL = "web";

/** The UTC calendar day of an instant, as the text Postgres reads as a date. */
const utcDayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Add one to today's count for a route. Counts only: no person, address, cookie or storage. An organisation row
 * is an ordinary upsert on the composite key. The platform row has no organisation, and Postgres treats NULLs as
 * distinct in a plain unique index, so it conflicts on the partial index WebVisitDaily_platform_key instead.
 */
export async function recordVisit(organisationId: string | null, route: string, now = new Date()): Promise<void> {
  const key = utcDayKey(now);
  if (organisationId) {
    await prisma.webVisitDaily.upsert({
      where: { organisationId_day_route_channel: { organisationId, day: new Date(`${key}T00:00:00.000Z`), route, channel: CHANNEL } },
      create: { organisationId, day: new Date(`${key}T00:00:00.000Z`), route, channel: CHANNEL, count: 1 },
      update: { count: { increment: 1 } },
    });
    return;
  }
  await prisma.$executeRaw`
    INSERT INTO "WebVisitDaily" ("id", "organisationId", "day", "route", "channel", "count")
    VALUES (${randomUUID()}, NULL, ${key}::date, ${route}, ${CHANNEL}, 1)
    ON CONFLICT ("day", "route", "channel") WHERE "organisationId" IS NULL
    DO UPDATE SET "count" = "WebVisitDaily"."count" + 1`;
}
