import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { enqueueOutbox } from "@/lib/outbox";
import { queueChatAlerts } from "@/lib/chat/notify";
import { uploadKeyFromUrl } from "@/lib/uploadUrl";
import { canTransition, statusAt } from "@/lib/membership/lifecycle";
import { decideTerm, MembershipError } from "@/lib/membership/service";

type Tx = Prisma.TransactionClient;
type OrgClock = { id: string; timezone: string; financialYearStartMonth: number };

export const ERASED_NAME = "Erased member";

/** The placeholder address an anonymised member keeps, unique per organisation and never deliverable. */
export function erasedEmail(memberId: string) {
  return `erased-${memberId.toLowerCase()}@erased.invalid`;
}

/**
 * Erase a member's personal details in one organisation. The record stays (member number, terms and
 * their history), so counts, reports and money rows keep adding up; everything that identifies the
 * person is replaced or cleared. Live and pending terms end, because a membership without a person
 * can't continue. Money rows are kept for 8 years and are never deleted here.
 *
 * This is the one place anonymisation happens: P7 extends it to anonymise payment rows (payer names,
 * emails and notes) in the same transaction. Returns upload keys to delete once the transaction commits.
 */
async function anonymiseMember(tx: Tx, args: { org: OrgClock; memberId: string; actorUserId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const member = await tx.member.findFirst({ where: { id: args.memberId, organisationId: args.org.id } });
  if (!member) throw new MembershipError("Member not found.");
  if (member.anonymisedAt) return { uploadKeys: [] as string[] };

  const terms = await tx.membershipTerm.findMany({ where: { memberId: member.id, organisationId: args.org.id } });
  for (const term of terms) {
    if (canTransition("withdraw", statusAt(term, now))) {
      await decideTerm(tx, { org: args.org, termId: term.id, action: "withdraw", actorUserId: args.actorUserId, reason: "Details erased on request", now });
    }
  }
  await tx.memberRoleAssignment.deleteMany({ where: { organisationId: args.org.id, memberId: member.id } });
  await tx.consentRecord.updateMany({ where: { organisationId: args.org.id, memberId: member.id, withdrawnAt: null }, data: { withdrawnAt: now } });
  // Refund requests stay as money history; the member's own words go.
  await tx.refundRequest.updateMany({ where: { organisationId: args.org.id, memberId: member.id }, data: { reason: "Removed on erasure" } });
  await tx.member.update({
    where: { id: member.id },
    data: {
      name: ERASED_NAME,
      email: erasedEmail(member.id),
      phone: null,
      photoUrl: null,
      stateCode: null,
      gstin: null,
      fieldValues: {},
      isMinor: false,
      guardianName: null,
      guardianEmail: null,
      guardianPhone: null,
      notes: "",
      userId: null,
      anonymisedAt: now,
    },
  });
  // Free text the person or the team wrote about them goes too: their request reasons, notes on their
  // memberships, and invitations addressed to their email.
  await tx.erasureRequest.updateMany({ where: { organisationId: args.org.id, memberId: member.id }, data: { reason: "" } });
  await tx.membershipTerm.updateMany({ where: { organisationId: args.org.id, memberId: member.id, reason: { not: "Details erased on request" } }, data: { reason: null } });
  await tx.memberInvite.updateMany({ where: { organisationId: args.org.id, email: member.email.toLowerCase() }, data: { email: null, revokedAt: now } });
  // Payment rows keep amounts, dates, bank references (UTR) and tax documents, which accounting law needs
  // for eight years; free-text notes and references are cleared, and the rows are marked anonymised.
  await tx.payment.updateMany({ where: { organisationId: args.org.id, memberId: member.id }, data: { note: "", reference: null, anonymisedAt: now } });
  await recordAuditEvent({ action: "MEMBER_ANONYMISED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "Member", targetId: member.id, client: tx });
  const photoKey = member.photoUrl ? uploadKeyFromUrl(member.photoUrl) : null;
  return { uploadKeys: photoKey ? [photoKey] : [] };
}

/** A member asks the organisation to erase their details. One open request at a time. */
export async function requestErasure(tx: Tx, args: { organisationId: string; memberId: string; userId: string; reason: string }) {
  const open = await tx.erasureRequest.findFirst({ where: { organisationId: args.organisationId, memberId: args.memberId, status: "PENDING" }, select: { id: true } });
  if (open) throw new MembershipError("You already asked. The organisation will email you their decision.");
  const request = await tx.erasureRequest.create({ data: { organisationId: args.organisationId, memberId: args.memberId, requestedByUserId: args.userId, reason: args.reason } });
  await recordAuditEvent({ action: "ERASURE_REQUESTED", actorUserId: args.userId, organisationId: args.organisationId, targetType: "ErasureRequest", targetId: request.id, client: tx });
  await enqueueOutbox(tx, "erasure-notice", { requestId: request.id, organisationId: args.organisationId, event: "requested" });
  await queueChatAlerts(tx, args.organisationId, "erasure-requested", { requestId: request.id });
  return request;
}

/** The member changes their mind before a manager decides. */
export async function withdrawErasure(tx: Tx, args: { organisationId: string; memberId: string; requestId: string; userId: string }) {
  const updated = await tx.erasureRequest.updateMany({ where: { id: args.requestId, organisationId: args.organisationId, memberId: args.memberId, status: "PENDING" }, data: { status: "WITHDRAWN" } });
  if (updated.count !== 1) throw new MembershipError("This request was already decided.");
  await recordAuditEvent({ action: "ERASURE_WITHDRAWN", actorUserId: args.userId, organisationId: args.organisationId, targetType: "ErasureRequest", targetId: args.requestId, client: tx });
}

/** A manager approves (the member is anonymised) or rejects (with a note) a pending request. */
export async function decideErasure(tx: Tx, args: { org: OrgClock; requestId: string; approve: boolean; note: string | null; actorUserId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ErasureRequest" WHERE "id" = ${args.requestId} AND "organisationId" = ${args.org.id} AND "status" = 'PENDING' FOR UPDATE`;
  if (rows.length === 0) throw new MembershipError("This request was already decided or withdrawn.");
  const request = await tx.erasureRequest.findUniqueOrThrow({ where: { id: args.requestId } });
  if (!args.approve && !args.note) throw new MembershipError("Say why, so the member understands.");
  const result = args.approve ? await anonymiseMember(tx, { org: args.org, memberId: request.memberId, actorUserId: args.actorUserId, now }) : { uploadKeys: [] };
  await tx.erasureRequest.update({
    where: { id: request.id },
    data: { status: args.approve ? "APPROVED" : "REJECTED", decidedById: args.actorUserId, decidedAt: now, decisionNote: args.note },
  });
  await recordAuditEvent({ action: args.approve ? "ERASURE_APPROVED" : "ERASURE_REJECTED", actorUserId: args.actorUserId, organisationId: args.org.id, targetType: "ErasureRequest", targetId: request.id, client: tx });
  await enqueueOutbox(tx, "erasure-notice", { requestId: request.id, organisationId: args.org.id, event: args.approve ? "approved" : "rejected" });
  return { memberId: request.memberId, uploadKeys: result.uploadKeys };
}
