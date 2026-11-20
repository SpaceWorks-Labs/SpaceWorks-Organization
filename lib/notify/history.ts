import "server-only";

import { prisma } from "@/lib/db";
import { PORTAL_ORGANISATION_STATUSES, verifiedEmail } from "@/lib/portal/member";
import { CHANNEL_LABELS, MESSAGE_KIND_LABELS, isMemberMessageKind, type MemberChannel } from "@/lib/messages/kinds";

export const MESSAGE_HISTORY_LIMIT = 30;

export type OwnMessage = { id: string; kind: string; organisation: string; channel: string | null; status: "Sent" | "Failed" | "Waiting"; when: Date };

/**
 * The messages sent to the signed-in person: their member records are found by verified email exactly as the portal
 * does (anonymised records and organisations with the member portal off are left out), newest first. Only the kind,
 * channel, status and date are read; message wording and values never leave the database.
 */
export async function loadOwnMessages(userId: string): Promise<OwnMessage[]> {
  const email = await verifiedEmail(userId);
  if (!email) return [];
  const members = await prisma.member.findMany({
    where: { email, anonymisedAt: null, organisation: { memberPortal: true, status: { in: [...PORTAL_ORGANISATION_STATUSES] } } },
    select: { id: true, organisationId: true, organisation: { select: { name: true } } },
  });
  if (!members.length) return [];
  const rows = await prisma.memberMessageLog.findMany({
    where: { OR: members.map((member) => ({ organisationId: member.organisationId, memberId: member.id })) },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_HISTORY_LIMIT,
    select: { id: true, organisationId: true, kind: true, status: true, channel: true, createdAt: true },
  });
  const names = new Map(members.map((member) => [member.organisationId, member.organisation.name]));
  return rows.map((row) => ({
    id: row.id,
    kind: isMemberMessageKind(row.kind) ? MESSAGE_KIND_LABELS[row.kind].title : "Message",
    organisation: names.get(row.organisationId) ?? "Organisation",
    channel: row.channel ? CHANNEL_LABELS[row.channel as MemberChannel] ?? row.channel : null,
    status: row.status === "SENT" ? "Sent" : row.status === "FAILED" ? "Failed" : "Waiting",
    when: row.createdAt,
  }));
}
