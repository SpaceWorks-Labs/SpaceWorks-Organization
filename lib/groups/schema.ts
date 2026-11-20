import { z } from "zod";

/**
 * A smart group's condition: a tree of AND / OR / NOT over rules about a member. Pure and client-safe (the builder
 * and the server validate with the same schema). Compiled to a Prisma filter by lib/groups/compile.ts, never to SQL.
 */

export const TERM_STATUSES = ["PENDING_APPROVAL", "PENDING_PAYMENT", "UPCOMING", "ACTIVE", "GRACE", "ENDED", "LAPSED", "EXPIRED", "CANCELLED", "REJECTED", "REVOKED"] as const;
export const MAX_CONDITION_DEPTH = 6;
export const MAX_CONDITION_NODES = 60;

const id = z.string().trim().min(1).max(64);
const ids = z.array(id).min(1).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const key = z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, "A question key: lowercase letters, digits and underscores");
const text = z.string().trim().min(1).max(200);

export type Rule =
  | { type: "plan"; planIds: string[] }
  | { type: "status"; statuses: Array<(typeof TERM_STATUSES)[number]> }
  | { type: "unit"; unitIds: string[] }
  | { type: "grouping"; groupingId: string; valueIds: string[] }
  | { type: "answer"; key: string; op: "equals" | "contains"; value: string }
  | { type: "answerIn"; key: string; values: string[] }
  | { type: "joined"; op: "before" | "after"; date: string }
  | { type: "renewed"; op: "before" | "after"; date: string }
  | { type: "endsWithin"; days: number }
  | { type: "age"; key: string; min?: number; max?: number }
  | { type: "state"; codes: string[] }
  | { type: "city"; key: string; value: string }
  | { type: "paymentDue" };

export type Condition = Rule | { type: "and"; items: Condition[] } | { type: "or"; items: Condition[] } | { type: "not"; item: Condition };

const rule: z.ZodType<Rule> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan"), planIds: ids }),
  z.object({ type: z.literal("status"), statuses: z.array(z.enum(TERM_STATUSES)).min(1).max(TERM_STATUSES.length) }),
  z.object({ type: z.literal("unit"), unitIds: ids }),
  z.object({ type: z.literal("grouping"), groupingId: id, valueIds: ids }),
  z.object({ type: z.literal("answer"), key, op: z.enum(["equals", "contains"]), value: text }),
  z.object({ type: z.literal("answerIn"), key, values: z.array(text).min(1).max(50) }),
  z.object({ type: z.literal("joined"), op: z.enum(["before", "after"]), date }),
  z.object({ type: z.literal("renewed"), op: z.enum(["before", "after"]), date }),
  z.object({ type: z.literal("endsWithin"), days: z.number().int().min(0).max(3650) }),
  z.object({ type: z.literal("age"), key, min: z.number().int().min(0).max(130).optional(), max: z.number().int().min(0).max(130).optional() })
    .refine((value) => value.min !== undefined || value.max !== undefined, "Give a minimum, a maximum or both")
    .refine((value) => value.min === undefined || value.max === undefined || value.min <= value.max, "The minimum can't be above the maximum"),
  z.object({ type: z.literal("state"), codes: z.array(z.string().trim().min(2).max(3)).min(1).max(40) }),
  z.object({ type: z.literal("city"), key, value: text }),
  z.object({ type: z.literal("paymentDue") }),
]);

const node: z.ZodType<Condition> = z.lazy(() => z.union([
  rule,
  z.object({ type: z.literal("and"), items: z.array(node).min(1).max(30) }),
  z.object({ type: z.literal("or"), items: z.array(node).min(1).max(30) }),
  z.object({ type: z.literal("not"), item: node }),
]));

/** The size limits hold for the whole tree, so a saved condition is always cheap to compile. */
export function conditionShape(condition: Condition): { depth: number; nodes: number } {
  if (condition.type === "and" || condition.type === "or") {
    const inner = condition.items.map(conditionShape);
    return { depth: 1 + Math.max(0, ...inner.map((entry) => entry.depth)), nodes: 1 + inner.reduce((sum, entry) => sum + entry.nodes, 0) };
  }
  if (condition.type === "not") {
    const inner = conditionShape(condition.item);
    return { depth: 1 + inner.depth, nodes: 1 + inner.nodes };
  }
  return { depth: 1, nodes: 1 };
}

export const smartGroupConditionSchema = node.superRefine((condition, ctx) => {
  const { depth, nodes } = conditionShape(condition);
  if (depth > MAX_CONDITION_DEPTH) ctx.addIssue({ code: "custom", message: `Nest conditions at most ${MAX_CONDITION_DEPTH} levels deep` });
  if (nodes > MAX_CONDITION_NODES) ctx.addIssue({ code: "custom", message: `Use at most ${MAX_CONDITION_NODES} conditions` });
});

/** A condition that matches every member: the start of a new smart group. */
export const EVERYONE: Condition = { type: "and", items: [{ type: "status", statuses: ["ACTIVE", "GRACE"] }] };
