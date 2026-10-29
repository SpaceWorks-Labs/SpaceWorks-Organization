import "server-only";

import { prisma } from "@/lib/db";
import { deriveStatus, TERM_STATUS_LABELS } from "@/lib/membership/lifecycle";
import { formatCalendarDate, lastValidDay, localDate } from "@/lib/membership/periods";
import { reportingUnits, type ReportContext } from "../context";
import { prepareDataset, type Dataset } from "../dataset";
import { contactFor } from "../mask";
import { applicationTimes } from "../metrics/approvals";
import { unitLeague } from "../metrics/breakdowns";
import { cohortRetention } from "../metrics/series";
import { closingInstant, firstActivation, standingAt } from "../metrics/standing";
import { lapsedNotBack, renewalWorklist, WORKLIST_DAYS } from "../renewals";
import { loadReportRows, scopedMemberWhere } from "../source";

export type Built = { header: string[]; rows: AsyncIterable<unknown[]> | Iterable<unknown[]>; filters?: Record<string, string> };
const PAGE = 500;
const SOURCE = { JOIN_FORM: "Join form", MANUAL: "Added by a manager", IMPORT: "Imported" } as const;
const day = (instant: Date | null, tz: string) => (instant ? formatCalendarDate(localDate(instant, tz)) : "");

async function dataset(ctx: ReportContext): Promise<Dataset> {
  return prepareDataset(await loadReportRows(ctx.scope));
}

/** B2: every member in scope, page by page from the database, standing read at the end of the period. */
export async function registerExport(ctx: ReportContext, search: URLSearchParams): Promise<Built> {
  const data = await dataset(ctx);
  const end = closingInstant(ctx.period.to, ctx.now);
  const standing = search.get("standing") ?? "all";
  const keep = (id: string) => {
    const terms = data.termsByMember.get(id);
    const s = standingAt(terms, end);
    if (standing === "active") return s === "ACTIVE";
    if (standing === "grace") return s === "GRACE";
    if (standing === "former") return s === null && Boolean(firstActivation(terms));
    if (standing === "never") return !firstActivation(terms);
    return true;
  };
  const plans = ctx.plans;
  const roleName = new Map(ctx.roles.map((role) => [role.id, role.name]));
  const tz = ctx.org.timezone;
  async function* rows() {
    let cursor: string | undefined;
    for (;;) {
      const page = await prisma.member.findMany({
        where: scopedMemberWhere(ctx.scope),
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, memberNumber: true, name: true, email: true, phone: true, stateCode: true, source: true, anonymisedAt: true, unit: { select: { name: true } }, terms: { select: { id: true, planId: true, status: true, startsAt: true, endsAt: true, graceUntil: true, paymentDueBy: true, renewedFromId: true, createdAt: true } } },
      });
      for (const member of page) {
        if (!keep(member.id)) continue;
        const erased = Boolean(member.anonymisedAt);
        const contact = contactFor(ctx.showContact && !erased, member);
        const s = standingAt(data.termsByMember.get(member.id), end);
        yield [
          member.memberNumber, erased ? "Erased member" : member.name, erased ? "" : contact.email, erased ? "" : contact.phone, member.unit?.name ?? "", member.stateCode ?? "",
          (data.memberById.get(member.id)?.roleIds ?? []).map((id) => roleName.get(id) ?? "").join("; "), SOURCE[member.source],
          s === "ACTIVE" ? "Active" : s === "GRACE" ? "In grace" : "Not active", day(firstActivation(data.termsByMember.get(member.id)), tz),
          ...plans.flatMap((plan) => {
            const chain = member.terms.filter((term) => term.planId === plan.id);
            if (!chain.length) return ["", ""];
            const derived = deriveStatus(chain, ctx.now);
            return [TERM_STATUS_LABELS[derived.status], derived.current?.endsAt ? formatCalendarDate(lastValidDay(derived.current.endsAt, tz)) : ""];
          }),
        ];
      }
      if (page.length < PAGE) return;
      cursor = page[page.length - 1].id;
    }
  }
  return {
    header: ["Member number", "Name", "Email", "Phone", "Unit", "State", "Roles", "Joined by", `Standing at ${ctx.period.lastDay.day}/${ctx.period.lastDay.month}/${ctx.period.lastDay.year}`, "Member since", ...plans.flatMap((plan) => [`${plan.name}: status`, `${plan.name}: valid until`])],
    rows: rows(),
    filters: { standing, masked: String(!ctx.showContact) },
  };
}

export async function worklistExport(ctx: ReportContext, search: URLSearchParams): Promise<Built> {
  const days = (WORKLIST_DAYS as readonly number[]).includes(Number(search.get("days"))) ? Number(search.get("days")) : 30;
  const rows = await renewalWorklist(await dataset(ctx), ctx.scope, days, ctx.showContact, ctx.org.timezone, ctx.now, 100_000);
  return {
    header: ["Member number", "Name", "Email", "Phone", "Plan", "Valid until", "Days left", "In grace", "Last reminder"],
    rows: rows.map((row) => [row.memberNumber, row.name, row.email, row.phone, row.planName, row.validUntil, row.daysLeft, row.inGrace ? "Yes" : "No", row.lastReminder ? row.lastReminder.toISOString().slice(0, 10) : ""]),
    filters: { days: String(days) },
  };
}

export async function lapsedExport(ctx: ReportContext): Promise<Built> {
  const data = await dataset(ctx);
  const plan = new Map(ctx.plans.map((p) => [p.id, p.name]));
  return {
    header: ["Member number", "Name", "Plan", "Lapsed on"],
    rows: lapsedNotBack(data, ctx.period, ctx.now, ctx.org.timezone).map((row) => [data.memberById.get(row.memberId)?.memberNumber ?? "", data.memberById.get(row.memberId)?.name ?? "", plan.get(row.planId) ?? "", row.lapsedOn]),
  };
}

export async function approvalsExport(ctx: ReportContext): Promise<Built> {
  const data = await dataset(ctx);
  const plan = new Map(ctx.plans.map((p) => [p.id, p.name]));
  const rows = data.terms.flatMap((term) => {
    const times = applicationTimes(term);
    if (!times.appliedAt) return [];
    const relevant = (times.appliedAt >= ctx.period.from && times.appliedAt < ctx.period.to) || (times.decidedAt && times.decidedAt >= ctx.period.from && times.decidedAt < ctx.period.to) || (!times.decision && term.status === "PENDING_APPROVAL");
    if (!relevant) return [];
    const member = data.memberById.get(term.memberId);
    const hours = times.decidedAt ? Math.round((times.decidedAt.getTime() - times.appliedAt.getTime()) / 3_600_000) : "";
    return [[member?.memberNumber ?? "", member?.name ?? "", plan.get(term.planId) ?? "", times.appliedAt.toISOString(), times.decision ?? "waiting", times.decidedAt?.toISOString() ?? "", hours]];
  });
  return { header: ["Member number", "Name", "Plan", "Applied at", "Decision", "Decided at", "Hours to decide"], rows };
}

export async function cohortsExport(ctx: ReportContext): Promise<Built> {
  const rows = cohortRetention(await dataset(ctx), ctx.org.timezone, ctx.now, 24, 24);
  return { header: ["Joined", "People", ...Array.from({ length: 24 }, (_, i) => `Month ${i}`)], rows: rows.map((row) => [row.label, row.size, ...row.cells.map((cell) => (cell === null ? "" : `${Math.round(cell * 1000) / 10}%`))]) };
}

export async function unitsExport(ctx: ReportContext): Promise<Built> {
  const data = await dataset(ctx);
  const rows = unitLeague(data, await reportingUnits(ctx, data.members), ctx.scope.unitPath, ctx.period, ctx.now);
  return { header: ["Unit", "Active", "In grace", "Joined", "Lapsed", "Renewal rate", "Share of active"], rows: rows.map((row) => [row.name, row.active, row.grace, row.joined, row.lapsed, row.renewalRate === null ? "" : `${Math.round(row.renewalRate * 100)}%`, row.share === null ? "" : `${Math.round(row.share * 100)}%`]) };
}
