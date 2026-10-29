/**
 * H6 drill-down by level: one row per unit directly below the scope (the top level when the report covers the
 * whole organisation), each counting its whole subtree. Active members now, growth over 30 and 90 days, the
 * renewal rate in the period, money collected in the period and outstanding now, per currency and never added
 * across currencies. Pure. Definitions: docs/REPORTS.md "Level league".
 */
import { inSubtree, ratio, type Dataset } from "../dataset";
import { subtractTotals, totals, type CurrencyTotal } from "../money";
import type { FinancePayment, FinanceRefund, UnpaidTerm } from "../finance/types";
import { renewalOutcomes, type Window } from "./flows";
import { standingAt } from "./standing";

type LevelUnit = { id: string; name: string; path: string };

/** Finance rows already limited to the viewer's scope: paid in the period, refunded in it, and open now. */
type LevelMoney = { paid: FinancePayment[]; refunds: Array<FinanceRefund & { memberId: string }>; open: FinancePayment[]; unpaid: UnpaidTerm[] };

type LevelRow = {
  unitId: string | null;
  name: string;
  path: string | null;
  /** Units sit below this one, so the row drills down a level. */
  hasChildren: boolean;
  active: number;
  active30: number;
  active90: number;
  growth30: number | null;
  growth90: number | null;
  renewalRate: number | null;
  decided: number;
  collected: CurrencyTotal[] | null;
  outstanding: CurrencyTotal[] | null;
};

const DAY = 86_400_000;

/** The units one level below `rootPath`, or the top-level units when it is null. */
function childUnits<T extends LevelUnit>(units: T[], rootPath: string | null): T[] {
  const depth = rootPath ? rootPath.split("/").length : 0;
  return units.filter((unit) => unit.path.split("/").length === depth + 1 && inSubtree(unit.path, rootPath));
}

export function levelLeague(data: Dataset, units: LevelUnit[], rootPath: string | null, window: Window, now: Date, money: LevelMoney | null, primary?: string): LevelRow[] {
  const amount = (row: { currency: string; amountMinor: number }) => ({ currency: row.currency, minor: row.amountMinor });
  const build = (unitId: string | null, name: string, path: string | null, keep: (unitPath: string | null) => boolean): LevelRow => {
    const ids = new Set(data.members.filter((member) => keep(member.unitPath)).map((member) => member.id));
    const termsByMember = new Map([...data.termsByMember].filter(([id]) => ids.has(id)));
    const activeAt = (t: Date) => {
      let count = 0;
      for (const [, terms] of termsByMember) if (standingAt(terms, t) === "ACTIVE") count += 1;
      return count;
    };
    const active = activeAt(now);
    const active30 = activeAt(new Date(now.getTime() - 30 * DAY));
    const active90 = activeAt(new Date(now.getTime() - 90 * DAY));
    const outcomes = renewalOutcomes({ ...data, terms: data.terms.filter((term) => ids.has(term.memberId)), termsByMember }, window, now);
    const decided = outcomes.renewed.length + outcomes.lapsed.length;
    const mine = <T extends { memberId: string }>(rows: T[]) => rows.filter((row) => ids.has(row.memberId));
    return {
      unitId,
      name,
      path,
      hasChildren: path !== null && unitId !== null && units.some((unit) => unit.path.startsWith(`${path}/`)),
      active,
      active30,
      active90,
      growth30: ratio(active - active30, active30),
      growth90: ratio(active - active90, active90),
      renewalRate: ratio(outcomes.renewed.length, decided),
      decided,
      collected: money ? subtractTotals(totals(mine(money.paid), amount, primary), totals(mine(money.refunds), amount, primary), primary) : null,
      outstanding: money ? totals([...mine(money.open), ...mine(money.unpaid)], amount, primary) : null,
    };
  };
  const rows = childUnits(units, rootPath).map((unit) => build(unit.id, unit.name, unit.path, (path) => inSubtree(path, unit.path)));
  // Members on the root unit itself, or with no unit at all (organisation-wide only).
  const direct = build(null, rootPath ? "This unit directly" : "No unit", rootPath, (path) => (rootPath ? path === rootPath : path === null));
  if (direct.active + direct.active90 + direct.decided > 0 || direct.collected?.length || direct.outstanding?.length) rows.push(direct);
  return rows.sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
}
