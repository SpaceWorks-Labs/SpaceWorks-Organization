import "server-only";

import { prisma } from "@/lib/db";
import { money } from "@/lib/membership/describe";
import { absoluteUrl } from "@/lib/email/message";
import { addMonths, startOfLocalDay } from "@/lib/membership/periods";
import { teamScope } from "@/lib/membership/scope";
import { prepareDataset } from "@/lib/reports/dataset";
import { membershipSummary } from "@/lib/reports/metrics/flows";
import { loadReportRows, reportScope } from "@/lib/reports/source";
import type { ChatEvent } from "./events";

export type ChatRefs = { termId?: string; paymentId?: string; requestId?: string; month?: string };

/** "Midlaj C (no. 281)" when the channel shows names, otherwise "member no. 281". */
const who = (member: { name: string; memberNumber: number }, names: boolean) => (names ? `${member.name} (no. ${member.memberNumber})` : `member no. ${member.memberNumber}`);

/**
 * The plain-text alert for one event, built when it is sent from ids only, so nothing personal sits in the
 * queue. Null when the record has gone (the alert is dropped). Erasure requests never carry a name.
 */
export async function chatMessage(organisationId: string, event: ChatEvent, refs: ChatRefs, includeNames: boolean): Promise<string | null> {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, slug: true, locale: true, timezone: true } });
  if (!org) return null;
  const base = `/dashboard/${org.slug}`;
  const line = (text: string, path: string) => `${org.name}: ${text}\n${absoluteUrl(path)}`;

  if ((event === "application" || event === "member-left") && refs.termId) {
    const term = await prisma.membershipTerm.findFirst({ where: { id: refs.termId, organisationId }, select: { member: { select: { id: true, name: true, memberNumber: true } }, plan: { select: { name: true } } } });
    if (!term) return null;
    return event === "application"
      ? line(`new application from ${who(term.member, includeNames)} for ${term.plan.name}. Review it:`, `${base}/members/${term.member.id}`)
      : line(`${who(term.member, includeNames)} left ${term.plan.name}.`, `${base}/members/${term.member.id}`);
  }
  if ((event === "payment" || event === "payment-to-confirm") && refs.paymentId) {
    const payment = await prisma.payment.findFirst({ where: { id: refs.paymentId, organisationId }, select: { amountMinor: true, currency: true, provider: true, member: { select: { name: true, memberNumber: true } }, term: { select: { plan: { select: { name: true } } } } } });
    if (!payment) return null;
    const what = `${money(payment.amountMinor, payment.currency, org.locale)} from ${who(payment.member, includeNames)}${payment.term ? ` for ${payment.term.plan.name}` : ""}`;
    return event === "payment"
      ? line(`payment received: ${what}.`, `${base}/payments/${refs.paymentId}`)
      : line(`payment waiting to be confirmed: ${what}. Confirm it:`, `${base}/payments/${refs.paymentId}`);
  }
  if (event === "refund-requested" && refs.requestId) {
    const request = await prisma.refundRequest.findFirst({ where: { id: refs.requestId, organisationId }, select: { paymentId: true, suggestedMinor: true, currency: true, member: { select: { name: true, memberNumber: true } }, term: { select: { plan: { select: { name: true } } } } } });
    if (!request) return null;
    return line(`${who(request.member, includeNames)} asked to cancel ${request.term.plan.name} with a refund of ${money(request.suggestedMinor, request.currency, org.locale)}. Review it:`, `${base}/payments/${request.paymentId}`);
  }
  if (event === "erasure-requested" && refs.requestId) {
    const request = await prisma.erasureRequest.findFirst({ where: { id: refs.requestId, organisationId }, select: { member: { select: { id: true, memberNumber: true } } } });
    if (!request) return null;
    return line(`member no. ${request.member.memberNumber} asked to erase their details. Review it:`, `${base}/members/${request.member.id}`);
  }
  if (event === "reminders-digest") {
    const logs = await prisma.memberMessageLog.groupBy({ by: ["status"], where: { organisationId, createdAt: { gt: new Date(Date.now() - 86_400_000) } }, _count: true });
    const count = (status: string) => logs.find((row) => row.status === status)?._count ?? 0;
    if (count("SENT") + count("FAILED") === 0) return null;
    return line(`${count("SENT")} reminders and messages went out to members in the last day${count("FAILED") ? `; ${count("FAILED")} could not be sent to anyone` : ""}.`, `${base}/members`);
  }
  if (event === "monthly-summary" && refs.month) {
    const [year, month] = refs.month.split("-").map(Number);
    if (!year || !month) return null;
    const first = { year, month, day: 1 };
    const window = { from: startOfLocalDay(first, org.timezone), to: startOfLocalDay(addMonths(first, 1), org.timezone) };
    const data = prepareDataset(await loadReportRows(await reportScope(await teamScope(organisationId, null), {})));
    const summary = membershipSummary(data, window, new Date());
    const waiting = await prisma.membershipTerm.count({ where: { organisationId, status: "PENDING_APPROVAL" } });
    const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 15)));
    return line(`${label} in short: ${summary.activeEnd} active members (${summary.netChange >= 0 ? "+" : ""}${summary.netChange}), ${summary.joined} joined, ${summary.lapsed} lapsed, ${waiting} waiting for approval.`, `${base}/reports`);
  }
  return null;
}
