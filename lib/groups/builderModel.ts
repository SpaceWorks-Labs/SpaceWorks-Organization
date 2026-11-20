import type { Condition, Rule } from "./schema";

/**
 * The condition builder's editing model: a tree of groups ("all of", "any of", "none of") and rules, each with an
 * id for stable keys. Pure and client-safe; `toCondition` and `fromCondition` convert to and from the saved form.
 */

export type GroupMode = "all" | "any" | "none";
export type UiRule = { kind: "rule"; id: string; rule: Rule };
export type UiGroup = { kind: "group"; id: string; mode: GroupMode; items: UiNode[] };
export type UiNode = UiRule | UiGroup;

let counter = 0;
export const nextId = () => `n${(counter += 1)}`;

export const RULE_LABELS: Record<Rule["type"], string> = {
  plan: "Is on a plan",
  status: "Has a membership with status",
  unit: "Is in a unit",
  grouping: "Holds a grouping value",
  answer: "Join-form answer",
  answerIn: "Join-form answer is one of",
  joined: "Joined",
  renewed: "Renewed",
  endsWithin: "Membership ends within",
  age: "Age",
  state: "State is",
  city: "City answer is",
  paymentDue: "Has a payment due",
};

/** The rules the builder offers (the two answer rules share one entry, with an operator). */
export const OFFERED_RULES: Array<Rule["type"]> = ["plan", "status", "unit", "grouping", "answer", "joined", "renewed", "endsWithin", "age", "state", "city", "paymentDue"];

export function defaultRule(type: Rule["type"]): Rule {
  switch (type) {
    case "plan": return { type, planIds: [] };
    case "status": return { type, statuses: ["ACTIVE"] };
    case "unit": return { type, unitIds: [] };
    case "grouping": return { type, groupingId: "", valueIds: [] };
    case "answer": return { type, key: "", op: "equals", value: "" };
    case "answerIn": return { type, key: "", values: [] };
    case "joined": case "renewed": return { type, op: "before", date: new Date().toISOString().slice(0, 10) };
    case "endsWithin": return { type, days: 30 };
    case "age": return { type, key: "", min: 18 };
    case "state": return { type, codes: [] };
    case "city": return { type, key: "city", value: "" };
    case "paymentDue": return { type };
  }
}

export const newRule = (type: Rule["type"] = "status"): UiRule => ({ kind: "rule", id: nextId(), rule: defaultRule(type) });
export const newGroup = (mode: GroupMode = "all", items: UiNode[] = []): UiGroup => ({ kind: "group", id: nextId(), mode, items });

export function fromCondition(condition: Condition): UiGroup {
  const node = (entry: Condition): UiNode => {
    if (entry.type === "and") return newGroup("all", entry.items.map(node));
    if (entry.type === "or") return newGroup("any", entry.items.map(node));
    if (entry.type === "not") return newGroup("none", entry.item.type === "or" ? entry.item.items.map(node) : [node(entry.item)]);
    return { kind: "rule", id: nextId(), rule: entry };
  };
  const root = node(condition);
  return root.kind === "group" ? root : newGroup("all", [root]);
}

/** Whether every rule is filled in enough to save (a rule naming nothing would match nobody, or everybody). */
export function ruleComplete(rule: Rule): boolean {
  switch (rule.type) {
    case "plan": return rule.planIds.length > 0;
    case "status": return rule.statuses.length > 0;
    case "unit": return rule.unitIds.length > 0;
    case "grouping": return Boolean(rule.groupingId) && rule.valueIds.length > 0;
    case "answer": return Boolean(rule.key) && Boolean(rule.value.trim());
    case "answerIn": return Boolean(rule.key) && rule.values.length > 0;
    case "joined": case "renewed": return /^\d{4}-\d{2}-\d{2}$/.test(rule.date);
    case "endsWithin": return Number.isInteger(rule.days) && rule.days >= 0;
    case "age": return Boolean(rule.key) && (rule.min !== undefined || rule.max !== undefined);
    case "state": return rule.codes.length > 0;
    case "city": return Boolean(rule.key) && Boolean(rule.value.trim());
    case "paymentDue": return true;
  }
}

export function isComplete(group: UiGroup): boolean {
  return group.items.length > 0 && group.items.every((item) => (item.kind === "rule" ? ruleComplete(item.rule) : isComplete(item)));
}

export function toCondition(group: UiGroup): Condition {
  const items = group.items.map((item): Condition => (item.kind === "rule" ? item.rule : toCondition(item)));
  if (group.mode === "all") return { type: "and", items };
  if (group.mode === "any") return { type: "or", items };
  return { type: "not", item: { type: "or", items } };
}
