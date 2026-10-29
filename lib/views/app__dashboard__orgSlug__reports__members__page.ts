import { prisma } from "@/lib/db";
import { TERM_STATUS_LABELS, deriveStatus } from "@/lib/membership/lifecycle";
import { formatCalendarDate, lastValidDay, localDate } from "@/lib/membership/periods";
import { prepareDataset } from "@/lib/reports/dataset";
import { drillHref } from "@/lib/reports/drillLinks";
import { dataQuality, geography, joinSources, planMix, roleDistribution, tenure, unitLeague } from "@/lib/reports/metrics/breakdowns";
import { closingInstant, firstActivation, standingAt } from "@/lib/reports/metrics/standing";
import { contactFor } from "@/lib/reports/mask";
import { drillFilters, openReport, reportShell } from "@/lib/reports/shell";
import { loadReportRows, scopedMemberWhere } from "@/lib/reports/source";
import { reportingUnits, type ReportSearch } from "@/lib/reports/context";

type Search = ReportSearch & { q?: string; standing?: string };
type Props = { params: Promise<{ orgSlug: string }>; searchParams: Promise<Search> };

const PAGE = 25;
const STANDINGS = ["all", "active", "grace", "former", "never"] as const;
const SOURCE_LABELS: Record<string, string> = { JOIN_FORM: "Join form", MANUAL: "Added by a manager", IMPORT: "Imported" };

/**
 * B2 member register and the member breakdowns: plan mix, unit league table, roles, join source, state,
 * tenure and data quality. Contact details are masked for roles without `members.contact` (Viewer).
 */
export async function loadOrgReportsMembers({ params, searchParams }: Props) {
  const search = await searchParams;
  const ctx = await openReport(params, Promise.resolve(search), "reports.membership");
  const { now, period, scope, org } = ctx;
  const data = prepareDataset(await loadReportRows(scope));
  const end = closingInstant(period.to, now);
  const filters = drillFilters(ctx);
  const planName = new Map(ctx.plans.map((plan) => [plan.id, plan.name]));
  const roleName = new Map(ctx.roles.map((role) => [role.id, role.name]));

  // Register: everyone in scope, narrowed by standing at the period's end and a search.
  const standing = (STANDINGS as readonly string[]).includes(search.standing ?? "") ? (search.standing as (typeof STANDINGS)[number]) : "all";
  const q = (search.q ?? "").trim().slice(0, 100).toLowerCase();
  const matches = data.members.filter((member) => {
    const terms = data.termsByMember.get(member.id);
    const now = standingAt(terms, end);
    if (standing === "active" && now !== "ACTIVE") return false;
    if (standing === "grace" && now !== "GRACE") return false;
    if (standing === "former" && (now !== null || !firstActivation(terms))) return false;
    if (standing === "never" && firstActivation(terms)) return false;
    return !q || member.name.toLowerCase().includes(q) || String(member.memberNumber) === q;
  }).sort((a, b) => b.memberNumber - a.memberNumber);
  const page = Math.max(1, Math.min(Math.ceil(matches.length / PAGE) || 1, Number.parseInt(search.page ?? "1", 10) || 1));
  const pageIds = matches.slice((page - 1) * PAGE, page * PAGE).map((member) => member.id);
  const details = await prisma.member.findMany({
    where: { ...scopedMemberWhere(scope), id: { in: pageIds } },
    select: { id: true, email: true, phone: true, anonymisedAt: true, unit: { select: { name: true } }, terms: { select: { id: true, planId: true, status: true, startsAt: true, endsAt: true, graceUntil: true, paymentDueBy: true, renewedFromId: true, createdAt: true } } },
  });
  const byId = new Map(details.map((member) => [member.id, member]));
  const register = pageIds.flatMap((id) => {
    const member = data.memberById.get(id);
    const detail = byId.get(id);
    if (!member || !detail) return [];
    const chains = new Map<string, typeof detail.terms>();
    for (const term of detail.terms) chains.set(term.planId, [...(chains.get(term.planId) ?? []), term]);
    const first = firstActivation(data.termsByMember.get(id));
    return [{
      id,
      memberNumber: member.memberNumber,
      name: detail.anonymisedAt ? "Erased member" : member.name,
      ...contactFor(ctx.showContact && !detail.anonymisedAt, detail),
      unit: detail.unit?.name ?? null,
      roles: member.roleIds.map((roleId) => roleName.get(roleId) ?? "Role"),
      memberSince: first ? formatCalendarDate(localDate(first, org.timezone)) : null,
      source: SOURCE_LABELS[member.source],
      plans: [...chains.entries()].map(([planId, chain]) => {
        const derived = deriveStatus(chain, now);
        return { planId, plan: planName.get(planId) ?? "Plan", status: derived.status, label: TERM_STATUS_LABELS[derived.status], until: derived.current?.endsAt ? formatCalendarDate(lastValidDay(derived.current.endsAt, org.timezone)) : null };
      }),
    }];
  });

  // Archived units still holding members keep their row, so nobody drops out of the breakdown.
  const leagueUnits = ctx.allUnits.length ? await reportingUnits(ctx, data.members) : [];
  const unitById = new Map(leagueUnits.map((unit) => [unit.id, unit]));
  const league = leagueUnits.length ? unitLeague(data, leagueUnits, scope.unitPath, period, now) : [];
  const tenureView = tenure(data, end);
  return {
    shell: reportShell(ctx, "members"),
    register: { rows: register, total: matches.length, page, pages: Math.max(1, Math.ceil(matches.length / PAGE)), standing, q: search.q ?? "" },
    masked: !ctx.showContact,
    planMix: planMix(data, end).map((row) => ({ key: row.key, label: planName.get(row.key) ?? "Plan", value: row.count, href: drillHref(org.slug, "active", { ...filters, plan: row.key }) })),
    units: league.map((row) => ({ ...row, href: row.unitId ? drillHref(org.slug, "active", { ...filters, unit: row.unitId }) : undefined, level: row.unitId ? unitById.get(row.unitId)?.level ?? 0 : null })),
    unitLevel: ctx.org.unitLevels[scope.unitPath ? scope.unitPath.split("/").length : 0] ?? "Unit",
    roles: roleDistribution(data, end).map((row) => ({ key: row.key, label: row.key === "none" ? "No role" : roleName.get(row.key) ?? "Role", value: row.count, href: row.key === "none" ? undefined : `/dashboard/${org.slug}/members?role=${row.key}` })),
    sources: joinSources(data, period, now).map((row) => ({ key: row.key, label: SOURCE_LABELS[row.key] ?? row.key, value: row.count, href: drillHref(org.slug, "joined", { ...filters, source: row.key }) })),
    states: geography(data, end).slice(0, 12).map((row) => ({ key: row.key, label: row.key === "none" ? "Not recorded" : row.key, value: row.count, href: drillHref(org.slug, "active", { ...filters, state: row.key }) })),
    tenure: { meanYears: tenureView.meanYears, bands: tenureView.bands.map((band) => ({ key: band.key, label: band.label, value: band.count, href: drillHref(org.slug, "active", { ...filters, tenure: band.key }) })) },
    quality: dataQuality(data, ctx.allUnits.length > 0),
    qualityLinks: {
      phone: drillHref(org.slug, "missing-phone", filters),
      state: drillHref(org.slug, "missing-state", filters),
      unit: drillHref(org.slug, "missing-unit", filters),
      photo: drillHref(org.slug, "missing-photo", filters),
      guardian: drillHref(org.slug, "minor-no-guardian", filters),
    },
  };
}

export type OrgReportsMembers = Awaited<ReturnType<typeof loadOrgReportsMembers>>;
