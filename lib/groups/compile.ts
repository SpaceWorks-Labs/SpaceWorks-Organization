import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, startOfLocalDay } from "@/lib/membership/periods";
import type { Condition, Rule } from "./schema";

const DAY_MS = 86_400_000;
const NOTHING: Prisma.MemberWhereInput = { id: { in: [] } };

type Context = { organisationId: string; timezone: string; now: Date };

const subtree = (path: string) => [{ path }, { path: { startsWith: `${path}/` } }];
const dayStart = (text: string, timezone: string) => {
  const [year, month, day] = text.split("-").map(Number);
  return startOfLocalDay({ year, month, day }, timezone);
};
const dayAfter = (text: string, timezone: string) => {
  const [year, month, day] = text.split("-").map(Number);
  return startOfLocalDay(addDays({ year, month, day }, 1), timezone);
};
/** The calendar date `years` before `now`, as the YYYY-MM-DD an answer stores. */
function yearsAgo(now: Date, years: number): string {
  const date = new Date(now.getTime());
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

async function ruleWhere(ctx: Context, rule: Rule): Promise<Prisma.MemberWhereInput> {
  const { organisationId, now } = ctx;
  switch (rule.type) {
    case "plan":
      return { terms: { some: { organisationId, planId: { in: rule.planIds } } } };
    case "status":
      return { terms: { some: { organisationId, status: { in: rule.statuses } } } };
    case "paymentDue":
      return { terms: { some: { organisationId, status: "PENDING_PAYMENT" } } };
    case "unit": {
      const units = await prisma.orgUnit.findMany({ where: { organisationId, id: { in: rule.unitIds } }, select: { path: true } });
      return units.length ? { unit: { is: { OR: units.flatMap((unit) => subtree(unit.path)) } } } : NOTHING;
    }
    case "grouping": {
      const values = await prisma.orgGroupingValue.findMany({ where: { organisationId, groupingId: rule.groupingId, id: { in: rule.valueIds }, archivedAt: null }, select: { path: true } });
      return values.length ? { groupingValues: { some: { organisationId, groupingId: rule.groupingId, value: { is: { OR: values.flatMap((value) => subtree(value.path)) } } } } } : NOTHING;
    }
    case "answer":
      return { fieldValues: rule.op === "equals" ? { path: [rule.key], equals: rule.value } : { path: [rule.key], string_contains: rule.value } };
    case "answerIn":
      return { OR: rule.values.map((value) => ({ fieldValues: { path: [rule.key], equals: value } })) };
    case "city":
      return { fieldValues: { path: [rule.key], equals: rule.value } };
    case "state":
      return { stateCode: { in: rule.codes.map((code) => code.toUpperCase()) } };
    case "joined":
      return { createdAt: rule.op === "before" ? { lt: dayStart(rule.date, ctx.timezone) } : { gte: dayAfter(rule.date, ctx.timezone) } };
    case "renewed": {
      const when = rule.op === "before" ? { lt: dayStart(rule.date, ctx.timezone) } : { gte: dayAfter(rule.date, ctx.timezone) };
      return { terms: { some: { organisationId, kind: "RENEWAL", createdAt: when } } };
    }
    case "endsWithin":
      return { terms: { some: { organisationId, status: { in: ["ACTIVE", "GRACE"] }, endsAt: { gte: now, lte: new Date(now.getTime() + rule.days * DAY_MS) } } } };
    case "age": {
      // Age from a date-of-birth answer: at least `min` years means born on or before that many years ago.
      const born: Prisma.JsonFilter[] = [];
      if (rule.min !== undefined) born.push({ path: [rule.key], lte: yearsAgo(now, rule.min) });
      if (rule.max !== undefined) born.push({ path: [rule.key], gt: yearsAgo(now, rule.max + 1) });
      return { AND: born.map((filter) => ({ fieldValues: filter })) };
    }
  }
}

/** A condition tree as a Prisma member filter for one organisation. Unknown units, plans and values, and archived grouping values, match nobody. */
export async function compileCondition(ctx: Context, condition: Condition): Promise<Prisma.MemberWhereInput> {
  if (condition.type === "and" || condition.type === "or") {
    const parts = await Promise.all(condition.items.map((item) => compileCondition(ctx, item)));
    return condition.type === "and" ? { AND: parts } : { OR: parts };
  }
  if (condition.type === "not") return { NOT: await compileCondition(ctx, condition.item) };
  return ruleWhere(ctx, condition);
}
