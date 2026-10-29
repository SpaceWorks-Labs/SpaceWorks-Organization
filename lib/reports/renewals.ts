import "server-only";

import { prisma } from "@/lib/db";
import { addDays, formatCalendarDate, lastValidDay, localDate, startOfLocalDay } from "@/lib/membership/periods";
import type { Dataset } from "./dataset";
import { lapseInstant, standingAt, termActiveAt, termGraceAt } from "./metrics/standing";
import { contactFor } from "./mask";
import type { ReportScope } from "./source";

export const WORKLIST_DAYS = [7, 30, 60, 90] as const;

type WorklistRow = {
  termId: string;
  memberId: string;
  memberNumber: number;
  name: string;
  email: string;
  phone: string;
  planName: string;
  validUntil: string;
  daysLeft: number;
  inGrace: boolean;
  lastReminder: Date | null;
  remindedToday: boolean;
};

/**
 * B3: memberships ending within `days` or already in grace, that nothing renews yet, soonest first. The
 * bulk reminder acts on these term ids (app/actions/reports.ts), inside the same scope.
 */
export async function renewalWorklist(data: Dataset, scope: ReportScope, days: number, showContact: boolean, timezone: string, now: Date, limit = 500): Promise<WorklistRow[]> {
  const horizon = now.getTime() + days * 86_400_000;
  const terms = data.terms
    .filter((term) => !term.renewed && term.endsAt && (termGraceAt(term, now) || (termActiveAt(term, now) && term.endsAt.getTime() <= horizon)))
    .sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime())
    .slice(0, limit);
  if (!terms.length) return [];
  const [members, plans, reminders] = await Promise.all([
    prisma.member.findMany({ where: { organisationId: scope.organisationId, id: { in: [...new Set(terms.map((term) => term.memberId))] }, anonymisedAt: null }, select: { id: true, email: true, phone: true } }),
    prisma.membershipPlan.findMany({ where: { organisationId: scope.organisationId }, select: { id: true, name: true } }),
    prisma.reminderLog.groupBy({ by: ["termId"], where: { termId: { in: terms.map((term) => term.id) } }, _max: { sentAt: true } }),
  ]);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const planName = new Map(plans.map((plan) => [plan.id, plan.name]));
  const lastSent = new Map(reminders.map((row) => [row.termId, row._max.sentAt]));
  const todayStart = startOfLocalDay(localDate(now, timezone), timezone);
  return terms.flatMap((term) => {
    const member = memberById.get(term.memberId);
    const info = data.memberById.get(term.memberId);
    if (!member || !info) return [];
    const last = lastSent.get(term.id) ?? null;
    return [{
      termId: term.id,
      memberId: term.memberId,
      memberNumber: info.memberNumber,
      name: info.name,
      ...contactFor(showContact, member),
      planName: planName.get(term.planId) ?? "Plan",
      validUntil: formatCalendarDate(lastValidDay(term.endsAt!, timezone)),
      daysLeft: Math.ceil((term.endsAt!.getTime() - now.getTime()) / 86_400_000),
      inGrace: termGraceAt(term, now),
      lastReminder: last,
      remindedToday: Boolean(last && last >= todayStart),
    }];
  });
}

/** Lapsed in the window and not back since (on any plan): the win-back list. */
export function lapsedNotBack(data: Dataset, window: { from: Date; to: Date }, now: Date, timezone: string) {
  const end = new Date(Math.min(window.to.getTime(), now.getTime()));
  const rows: Array<{ memberId: string; termId: string; planId: string; lapsedOn: string; lapsedAt: Date }> = [];
  for (const term of data.terms) {
    const lapse = lapseInstant(term);
    if (!lapse || lapse < window.from || lapse >= end) continue;
    if (standingAt(data.termsByMember.get(term.memberId), now) !== null) continue;
    rows.push({ memberId: term.memberId, termId: term.id, planId: term.planId, lapsedOn: formatCalendarDate(localDate(new Date(lapse.getTime() - 1), timezone)), lapsedAt: lapse });
  }
  return rows.sort((a, b) => b.lapsedAt.getTime() - a.lapsedAt.getTime());
}

/** The renewal calendar: active terms ending in each of the next `weeks` weeks with nothing renewing them. */
export function expiryCalendar(data: Dataset, now: Date, timezone: string, weeks = 13) {
  const first = localDate(now, timezone);
  const buckets = Array.from({ length: weeks }, (_, index) => {
    const from = startOfLocalDay(addDays(first, index * 7), timezone);
    const to = startOfLocalDay(addDays(first, (index + 1) * 7), timezone);
    const day = addDays(first, index * 7);
    return { key: `w${index}`, label: `${day.day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][day.month - 1]}`, from, to, count: 0 };
  });
  for (const term of data.terms) {
    if (term.renewed || !term.endsAt || !termActiveAt(term, now)) continue;
    const bucket = buckets.find((candidate) => term.endsAt! >= candidate.from && term.endsAt! < candidate.to);
    if (bucket) bucket.count += 1;
  }
  return buckets.map(({ key, label, count }) => ({ key, label, count }));
}
