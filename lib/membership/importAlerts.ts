import "server-only";

import type { Prisma } from "@prisma/client";
import { enqueueOutbox } from "@/lib/outbox";
import { staffWithCapability } from "@/lib/team/roles";
import { pathWithin } from "./planUnits";

type Tx = Prisma.TransactionClient;

/**
 * Who hears about an import that left members waiting to be verified: staff holding `members.manage` whose reach
 * takes in at least one of them (their role held for the whole organisation, or for the member's unit or an
 * ancestor). Each gets one count, of the waiting members they can verify. The importer is never told about their
 * own import, and a role held for a unit that no longer exists reaches nobody.
 */
async function verificationAlertRecipients(tx: Tx, organisationId: string, importerUserId: string, waitingUnitPaths: Array<string | null>) {
  if (!waitingUnitPaths.length) return [];
  const staff = await staffWithCapability(tx, organisationId, "members.manage");
  const unitIds = [...new Set(staff.flatMap((person) => (person.unitId ? [person.unitId] : [])))];
  const units = new Map((await tx.orgUnit.findMany({ where: { organisationId, id: { in: unitIds }, archivedAt: null }, select: { id: true, path: true } })).map((unit) => [unit.id, unit.path]));
  const recipients: Array<{ userId: string; count: number }> = [];
  for (const person of staff) {
    if (person.userId === importerUserId) continue;
    const reach = person.unitId ? units.get(person.unitId) : null;
    if (reach === undefined) continue;
    const count = reach === null ? waitingUnitPaths.length : waitingUnitPaths.filter((path) => path !== null && pathWithin(path, reach)).length;
    if (count > 0) recipients.push({ userId: person.userId, count });
  }
  return recipients;
}

/** Queue the one alert per recipient for an import, in the caller's transaction. Returns how many were queued. */
export async function queueVerificationAlerts(tx: Tx, organisationId: string, importerUserId: string, waitingUnitPaths: Array<string | null>) {
  const recipients = await verificationAlertRecipients(tx, organisationId, importerUserId, waitingUnitPaths);
  for (const recipient of recipients) await enqueueOutbox(tx, "verification-alert", { organisationId, userId: recipient.userId, count: recipient.count });
  return recipients.length;
}
