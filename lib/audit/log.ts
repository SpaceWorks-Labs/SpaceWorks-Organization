import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { activityCategory, isAccountSecurityAction, type ActivityCategory } from "@/lib/reports/activity";
import { isLimited, memberWhere, type TeamScope } from "@/lib/membership/scope";

export const LOG_PAGE_SIZE = 50;
/** Rows read per round trip while looking for a page, and how many round trips one page may take. */
const BATCH = 200;
const MAX_BATCHES = 10;

export type LogFilters = {
  /** A team member's user id, "members" (people acting for themselves) or "system" (no actor). */
  actor?: string;
  category?: string;
  /** Events about this member (the member, their terms, cards, payments and so on). */
  memberId?: string;
  from?: Date;
  /** Exclusive. */
  to?: Date;
  cursor?: string;
};

export type LogEvent = { id: string; action: string; actorUserId: string | null; targetType: string | null; targetId: string | null; metadata: Prisma.JsonValue; createdAt: Date; category: ActivityCategory; memberId: string | null };
export type LogPage = { events: LogEvent[]; next: string | null };

export const encodeCursor = (event: { createdAt: Date; id: string }) => `${event.createdAt.getTime()}_${event.id}`;
export function decodeCursor(text: string | undefined): { at: Date; id: string } | null {
  const match = /^(\d{1,15})_([A-Za-z0-9]{1,40})$/.exec(text ?? "");
  return match ? { at: new Date(Number(match[1])), id: match[2] } : null;
}

const ACCOUNT_PREFIXES = ["PASSKEY_", "PHONE_", "SESSION_", "SESSIONS_", "MFA_", "SIGN_IN_", "SIGN_OUT", "RECOVERY_CODE", "IDENTITY_", "ACCOUNT_", "IP_"];
const notAccountSecurity: Prisma.AuditEventWhereInput = { NOT: ACCOUNT_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } })) };

const jsonString = (metadata: Prisma.JsonValue, key: string): string | null => {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, Prisma.JsonValue>)[key];
    return typeof value === "string" ? value : null;
  }
  return null;
};

type SubjectInput = { id: string; targetType: string | null; targetId: string | null; metadata: Prisma.JsonValue };

/** The member each event is about: the member itself, a `memberId` in the metadata, or the member that owns the term, card, payment... */
export async function resolveSubjectMembers(organisationId: string, events: readonly SubjectInput[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byType = new Map<string, Set<string>>();
  for (const event of events) {
    const fromMeta = jsonString(event.metadata, "memberId");
    if (event.targetType === "Member" && event.targetId) out.set(event.id, event.targetId);
    else if (fromMeta) out.set(event.id, fromMeta);
    else if (event.targetType && event.targetId) byType.set(event.targetType, (byType.get(event.targetType) ?? new Set()).add(event.targetId));
  }
  const owners = new Map<string, string>();
  const ids = (type: string) => [...(byType.get(type) ?? [])];
  const where = (type: string) => ({ organisationId, id: { in: ids(type) } });
  const select = { id: true, memberId: true } as const;
  const read = async (type: string, rows: Promise<Array<{ id: string; memberId: string }>>) => {
    for (const row of await rows) owners.set(`${type}:${row.id}`, row.memberId);
  };
  await Promise.all([
    ids("MembershipTerm").length ? read("MembershipTerm", prisma.membershipTerm.findMany({ where: where("MembershipTerm"), select })) : null,
    ids("MemberCard").length ? read("MemberCard", prisma.memberCard.findMany({ where: where("MemberCard"), select })) : null,
    ids("Payment").length ? read("Payment", prisma.payment.findMany({ where: where("Payment"), select })) : null,
    ids("ErasureRequest").length ? read("ErasureRequest", prisma.erasureRequest.findMany({ where: where("ErasureRequest"), select })) : null,
    ids("ConsentRecord").length ? read("ConsentRecord", prisma.consentRecord.findMany({ where: where("ConsentRecord"), select })) : null,
    ids("RefundRequest").length ? read("RefundRequest", prisma.refundRequest.findMany({ where: where("RefundRequest"), select })) : null,
  ]);
  for (const event of events) {
    if (out.has(event.id) || !event.targetType || !event.targetId) continue;
    const owner = owners.get(`${event.targetType}:${event.targetId}`);
    if (owner) out.set(event.id, owner);
  }
  return out;
}

/** Everything about one member that audit events can point at, so a member's history can be filtered in the database. */
async function memberTargets(organisationId: string, memberId: string): Promise<Prisma.AuditEventWhereInput[]> {
  const where = { organisationId, memberId };
  const select = { id: true } as const;
  const take = 500;
  const [terms, cards, payments, erasures, consents, refunds] = await Promise.all([
    prisma.membershipTerm.findMany({ where, select, take }), prisma.memberCard.findMany({ where, select, take }), prisma.payment.findMany({ where, select, take }),
    prisma.erasureRequest.findMany({ where, select, take }), prisma.consentRecord.findMany({ where, select, take }), prisma.refundRequest.findMany({ where, select, take }),
  ]);
  const pair = (targetType: string, rows: Array<{ id: string }>): Prisma.AuditEventWhereInput[] => (rows.length ? [{ targetType, targetId: { in: rows.map((row) => row.id) } }] : []);
  return [
    { targetType: "Member", targetId: memberId }, { metadata: { path: ["memberId"], equals: memberId } },
    ...pair("MembershipTerm", terms), ...pair("MemberCard", cards), ...pair("Payment", payments),
    ...pair("ErasureRequest", erasures), ...pair("ConsentRecord", consents), ...pair("RefundRequest", refunds),
  ];
}

/**
 * One page of an organisation's audit trail, newest first: team, member and system events (never a person's own
 * account security). Staff limited to units or groupings see only events whose subject member is inside their reach;
 * organisation-level events (settings, plans, team) are for whole-organisation staff. Every query names the organisation.
 * A page is found by reading batches and keeping what matches, so a rare category may take a few "older" steps.
 */
export async function loadActivityLog(organisationId: string, scope: TeamScope, filters: LogFilters): Promise<LogPage> {
  const limited = isLimited(scope);
  const and: Prisma.AuditEventWhereInput[] = [{ organisationId }, notAccountSecurity];
  if (filters.from || filters.to) and.push({ createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } });
  if (filters.actor === "system") and.push({ actorUserId: null });
  else if (filters.actor === "members") {
    const team = await prisma.teamMember.findMany({ where: { organisationId }, select: { userId: true } });
    and.push({ actorUserId: { not: null, notIn: team.map((row) => row.userId) }, actor: { is: { isSuperAdmin: false } } });
  } else if (filters.actor) {
    if (!(await prisma.teamMember.count({ where: { organisationId, userId: filters.actor } }))) return { events: [], next: null };
    and.push({ actorUserId: filters.actor });
  }
  if (filters.memberId) {
    // A limited viewer may only ask about members inside their reach.
    if (!(await prisma.member.count({ where: { AND: [memberWhere(scope), { id: filters.memberId }] } }))) return { events: [], next: null };
    and.push({ OR: await memberTargets(organisationId, filters.memberId) });
  }
  const found: LogEvent[] = [];
  let cursor = decodeCursor(filters.cursor);
  let more = false;
  for (let round = 0; round < MAX_BATCHES && found.length <= LOG_PAGE_SIZE; round += 1) {
    const rows = await prisma.auditEvent.findMany({
      where: { AND: [...and, ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }] : [])] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: BATCH,
      select: { id: true, action: true, actorUserId: true, targetType: true, targetId: true, metadata: true, createdAt: true },
    });
    if (!rows.length) { more = false; break; }
    const last = rows[rows.length - 1];
    cursor = { at: last.createdAt, id: last.id };
    more = rows.length === BATCH;
    const wanted = rows.filter((row) => !isAccountSecurityAction(row.action) && (!filters.category || activityCategory(row.action) === filters.category));
    const subjects = wanted.length ? await resolveSubjectMembers(organisationId, wanted) : new Map<string, string>();
    let visible = new Set<string>();
    if (limited) {
      const ids = [...new Set(subjects.values())];
      visible = new Set((ids.length ? await prisma.member.findMany({ where: { AND: [memberWhere(scope), { id: { in: ids } }] }, select: { id: true } }) : []).map((member) => member.id));
    }
    for (const row of wanted) {
      const memberId = subjects.get(row.id) ?? null;
      if (limited && !(memberId && visible.has(memberId))) continue;
      found.push({ ...row, category: activityCategory(row.action), memberId });
    }
    if (!more) break;
  }
  const events = found.slice(0, LOG_PAGE_SIZE);
  if (found.length > LOG_PAGE_SIZE) return { events, next: encodeCursor(events[events.length - 1]) };
  // The scan stopped with unread rows: the next page starts after the last row read.
  return { events, next: more && cursor ? encodeCursor({ createdAt: cursor.at, id: cursor.id }) : null };
}
