import "server-only";

import { prisma } from "@/lib/db";
import { can, type StaffMembership } from "@/lib/permissions";
import { loadActivityLog } from "@/lib/audit/log";
import { actionLabel } from "@/lib/reports/activity";
import { CHANNEL_LABELS, MESSAGE_KIND_LABELS, isMemberMessageKind, type MemberChannel } from "@/lib/messages/kinds";
import type { TeamScope } from "@/lib/membership/scope";

const MEMBER_HISTORY_LIMIT = 30;

export type MemberMessageRow = { id: string; kind: string; channel: string | null; status: "Sent" | "Failed" | "Waiting"; delivery: string | null; when: Date };
export type MemberActivityRow = { id: string; label: string; when: Date };

/** The messages sent to one member of this organisation: kind, channel, state and date, never the wording. */
export async function loadMemberMessages(organisationId: string, memberId: string): Promise<MemberMessageRow[]> {
  const rows = await prisma.memberMessageLog.findMany({
    where: { organisationId, memberId },
    orderBy: { createdAt: "desc" },
    take: MEMBER_HISTORY_LIMIT,
    select: { id: true, kind: true, status: true, channel: true, deliveryState: true, createdAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: isMemberMessageKind(row.kind) ? MESSAGE_KIND_LABELS[row.kind].title : "Message",
    channel: row.channel ? CHANNEL_LABELS[row.channel as MemberChannel] ?? row.channel : null,
    status: row.status === "SENT" ? "Sent" : row.status === "FAILED" ? "Failed" : "Waiting",
    delivery: row.deliveryState,
    when: row.createdAt,
  }));
}

/** This member's audit events (the member, their terms, payments, cards...), newest first, within the viewer's reach. */
export async function loadMemberActivity(organisationId: string, scope: TeamScope, memberId: string): Promise<MemberActivityRow[]> {
  const page = await loadActivityLog(organisationId, scope, { memberId });
  return page.events.slice(0, MEMBER_HISTORY_LIMIT).map((event) => ({ id: event.id, label: actionLabel(event.action), when: event.createdAt }));
}

/**
 * The two history cards on the member page. Messages follow `members.contact` (they show that and how someone was
 * reached); activity follows `audit.view`, like the activity log it links to. Without the permission the rows are
 * never read.
 */
export async function loadMemberHistory(args: { organisationId: string; membership: StaffMembership; scope: TeamScope; memberId: string }) {
  const [messages, activity] = await Promise.all([
    can(args.membership, "members.contact") ? loadMemberMessages(args.organisationId, args.memberId) : null,
    can(args.membership, "audit.view") ? loadMemberActivity(args.organisationId, args.scope, args.memberId) : null,
  ]);
  return { messages, activity };
}
