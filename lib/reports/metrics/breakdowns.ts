/**
 * Who the members are: plan mix, unit league table, member roles, join source, state, tenure, data
 * quality and the upcoming-expiry calendar. Pure. Definitions: docs/REPORTS.md "Breakdowns".
 */
import { inSubtree, ratio, type Dataset } from "../dataset";
import { membershipSummary, type Window } from "./flows";
import { closingInstant, firstActivation, standingAt, termActiveAt } from "./standing";

type CountRow = { key: string; count: number };

function tally(keys: Iterable<string>): CountRow[] {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function activeMemberIds(data: Dataset, t: Date): string[] {
  const ids: string[] = [];
  for (const [memberId, terms] of data.termsByMember) if (standingAt(terms, t) === "ACTIVE") ids.push(memberId);
  return ids;
}

/** Active members per plan at `t`. A member on two plans counts on both, so rows can add up to more than Active(t). */
export function planMix(data: Dataset, t: Date): CountRow[] {
  const pairs = new Set<string>();
  for (const term of data.terms) if (termActiveAt(term, t)) pairs.add(`${term.planId}|${term.memberId}`);
  return tally([...pairs].map((pair) => pair.split("|")[0]));
}

/** Active members per member role (any role they hold), plus "none". */
export function roleDistribution(data: Dataset, t: Date): CountRow[] {
  return tally(activeMemberIds(data, t).flatMap((id) => {
    const roles = data.memberById.get(id)?.roleIds ?? [];
    return roles.length ? roles : ["none"];
  }));
}

/** New members in the period by how they arrived (join form, added by a manager, import). */
export function joinSources(data: Dataset, window: Window, now: Date): CountRow[] {
  const end = new Date(Math.min(window.to.getTime(), now.getTime()));
  const ids: string[] = [];
  for (const [memberId, terms] of data.termsByMember) {
    const first = firstActivation(terms);
    if (first && first >= window.from && first < end) ids.push(memberId);
  }
  return tally(ids.map((id) => data.memberById.get(id)?.source ?? "MANUAL"));
}

/** Active members by state or territory code ("none" when not recorded). */
export function geography(data: Dataset, t: Date): CountRow[] {
  return tally(activeMemberIds(data, t).map((id) => data.memberById.get(id)?.stateCode ?? "none"));
}

export const TENURE_BANDS = [
  { key: "lt1", label: "Under 1 year", maxYears: 1 },
  { key: "1to2", label: "1 to 2 years", maxYears: 2 },
  { key: "2to5", label: "2 to 5 years", maxYears: 5 },
  { key: "5plus", label: "5 years or more", maxYears: Infinity },
] as const;

/** Active members by time since they first became a member. Also the mean, in years. */
export function tenure(data: Dataset, t: Date): { bands: Array<{ key: string; label: string; count: number }>; meanYears: number | null } {
  const counts = new Map<string, number>(TENURE_BANDS.map((band) => [band.key, 0]));
  let total = 0;
  let n = 0;
  for (const id of activeMemberIds(data, t)) {
    const first = firstActivation(data.termsByMember.get(id));
    if (!first) continue;
    const years = (t.getTime() - first.getTime()) / (365.25 * 86_400_000);
    const band = TENURE_BANDS.find((candidate) => years < candidate.maxYears)!;
    counts.set(band.key, counts.get(band.key)! + 1);
    total += years;
    n += 1;
  }
  return { bands: TENURE_BANDS.map((band) => ({ key: band.key, label: band.label, count: counts.get(band.key)! })), meanYears: n ? total / n : null };
}

type DataQuality = { members: number; missingPhone: number; missingState: number; missingUnit: number | null; missingPhoto: number; minorsWithoutGuardian: number };

/** Gaps in member records, over every member in scope (not only active ones). */
export function dataQuality(data: Dataset, hasUnits: boolean): DataQuality {
  let missingPhone = 0;
  let missingState = 0;
  let missingUnit = 0;
  let missingPhoto = 0;
  let minorsWithoutGuardian = 0;
  for (const member of data.members) {
    if (!member.hasPhone) missingPhone += 1;
    if (!member.stateCode) missingState += 1;
    if (!member.unitId) missingUnit += 1;
    if (!member.hasPhoto) missingPhoto += 1;
    if (member.isMinor && !member.hasGuardian) minorsWithoutGuardian += 1;
  }
  return { members: data.members.length, missingPhone, missingState, missingUnit: hasUnits ? missingUnit : null, missingPhoto, minorsWithoutGuardian };
}

type UnitNode = { id: string; name: string; path: string; parentId: string | null };
type UnitLeagueRow = { unitId: string | null; name: string; path: string | null; active: number; grace: number; joined: number; lapsed: number; renewalRate: number | null; share: number | null };

/**
 * One row per unit directly below `rootPath` (or per top-level unit when the report covers the whole
 * organisation), each counting its whole subtree, plus "No unit" for members without one.
 */
export function unitLeague(data: Dataset, units: UnitNode[], rootPath: string | null, window: Window, now: Date): UnitLeagueRow[] {
  const rootDepth = rootPath ? rootPath.split("/").length : 0;
  const rows = units.filter((unit) => unit.path.split("/").length === rootDepth + 1 && inSubtree(unit.path, rootPath));
  const total = new Set<string>();
  const end = closingInstant(window.to, now);
  for (const [memberId, terms] of data.termsByMember) if (standingAt(terms, end) === "ACTIVE") total.add(memberId);
  const build = (unitId: string | null, name: string, path: string | null, keep: (unitPath: string | null) => boolean): UnitLeagueRow => {
    const members = data.members.filter((member) => keep(member.unitPath));
    const ids = new Set(members.map((member) => member.id));
    const subset = { ...data, members, terms: data.terms.filter((term) => ids.has(term.memberId)), termsByMember: new Map([...data.termsByMember].filter(([id]) => ids.has(id))) };
    const summary = membershipSummary(subset, window, now);
    return { unitId, name, path, active: summary.activeEnd, grace: summary.graceEnd, joined: summary.joined, lapsed: summary.lapsed, renewalRate: summary.renewalRate, share: ratio(summary.activeEnd, total.size) };
  };
  const league = rows.map((unit) => build(unit.id, unit.name, unit.path, (path) => inSubtree(path, unit.path)));
  // Members sitting on the root unit itself, or with no unit at all (organisation-wide reports only).
  const direct = build(null, rootPath ? "This unit directly" : "No unit", rootPath, (path) => (rootPath ? path === rootPath : path === null));
  if (direct.active + direct.grace + direct.joined + direct.lapsed > 0) league.push(direct);
  return league.sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
}

type ExpiryRow = { termId: string; memberId: string; planId: string; endsAt: Date; graceUntil: Date | null };

/** Active terms ending within `days` of now with nothing renewing them yet: the renewal calendar. */
export function upcomingExpiries(data: Dataset, now: Date, days: number): ExpiryRow[] {
  const horizon = now.getTime() + days * 86_400_000;
  return data.terms
    .filter((term) => termActiveAt(term, now) && term.endsAt && term.endsAt.getTime() <= horizon && !term.renewed)
    .map((term) => ({ termId: term.id, memberId: term.memberId, planId: term.planId, endsAt: term.endsAt!, graceUntil: term.graceUntil }))
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
}
