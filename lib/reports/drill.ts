import "server-only";

import type { TeamScope } from "@/lib/membership/scope";
import { closingInstant, firstActivation, standingAt } from "./metrics/standing";
import { periodSets } from "./metrics/flows";
import { TENURE_BANDS } from "./metrics/breakdowns";
import { DRILL_LABELS, isDrillKey, type DrillKey } from "./drillLinks";
import { resolvePeriod, type OrgCalendar } from "./period";
import { loadDataset, reportScope } from "./source";

export type DrillQuery = { drill?: string; period?: string; from?: string; to?: string; plan?: string; dunit?: string; dstate?: string; dsource?: string; dtenure?: string };

type DrillResult = { key: DrillKey; label: string; memberIds: string[] };

/**
 * The member ids behind a report tile, for the directory. Scope comes from the viewer's team role first,
 * then the drill's unit (only inside it) and plan, exactly as on the report, so the directory always shows
 * the same people the tile counted. Returns null when there is no valid drill in the query.
 */
export async function drillMemberIds(team: TeamScope, query: DrillQuery, calendar: OrgCalendar, now = new Date()): Promise<DrillResult | null> {
  if (!isDrillKey(query.drill)) return null;
  const key = query.drill;
  const scope = await reportScope(team, { unit: query.dunit, plan: query.plan });
  const data = await loadDataset(scope);
  const period = resolvePeriod(query, calendar, now);
  let ids: string[];
  if (key.startsWith("missing-") || key === "minor-no-guardian") {
    const test: Record<string, (m: (typeof data.members)[number]) => boolean> = {
      "missing-phone": (m) => !m.hasPhone,
      "missing-state": (m) => !m.stateCode,
      "missing-unit": (m) => !m.unitId,
      "missing-photo": (m) => !m.hasPhoto,
      "minor-no-guardian": (m) => m.isMinor && !m.hasGuardian,
    };
    ids = data.members.filter(test[key]).map((member) => member.id);
  } else {
    ids = [...periodSets(data, period, now)[key as Exclude<DrillKey, `missing-${string}` | "minor-no-guardian">]];
  }
  // Breakdown narrowing: state, join source and tenure band, as the breakdown tiles count them.
  const end = closingInstant(period.to, now);
  if (query.dstate) ids = ids.filter((id) => (data.memberById.get(id)?.stateCode ?? "none") === query.dstate);
  if (query.dsource) ids = ids.filter((id) => data.memberById.get(id)?.source === query.dsource);
  const band = TENURE_BANDS.find((candidate) => candidate.key === query.dtenure);
  if (band) {
    const index = TENURE_BANDS.indexOf(band);
    const min = index === 0 ? 0 : TENURE_BANDS[index - 1].maxYears;
    ids = ids.filter((id) => {
      const terms = data.termsByMember.get(id);
      const first = firstActivation(terms);
      if (!first || standingAt(terms, end) !== "ACTIVE") return false;
      const years = (end.getTime() - first.getTime()) / (365.25 * 86_400_000);
      return years >= min && years < band.maxYears;
    });
  }
  const parts = [DRILL_LABELS[key], key.startsWith("missing-") || key === "minor-no-guardian" ? null : period.label];
  return { key, label: parts.filter(Boolean).join(" · "), memberIds: ids };
}
