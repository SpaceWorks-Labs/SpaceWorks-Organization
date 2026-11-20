import { describe, expect, it } from "vitest";
import { MAX_CONDITION_DEPTH, MAX_CONDITION_NODES, smartGroupConditionSchema, type Condition } from "@/lib/groups/schema";
import { fromCondition, isComplete, newGroup, newRule, toCondition } from "@/lib/groups/builderModel";

const rule = (): Condition => ({ type: "status", statuses: ["ACTIVE"] });

describe("smart group conditions", () => {
  it("accept every rule type inside and, or and not", () => {
    const condition: Condition = {
      type: "and",
      items: [
        { type: "plan", planIds: ["p1"] }, { type: "status", statuses: ["ACTIVE", "GRACE"] }, { type: "unit", unitIds: ["u1"] },
        { type: "grouping", groupingId: "g1", valueIds: ["v1"] }, { type: "answer", key: "city", op: "contains", value: "kochi" },
        { type: "answerIn", key: "blood", values: ["A+", "B+"] }, { type: "joined", op: "before", date: "2026-01-01" },
        { type: "renewed", op: "after", date: "2026-01-01" }, { type: "endsWithin", days: 30 }, { type: "age", key: "dob", min: 18, max: 25 },
        { type: "state", codes: ["KL"] }, { type: "city", key: "city", value: "Kochi" }, { type: "paymentDue" },
        { type: "not", item: { type: "or", items: [rule(), rule()] } },
      ],
    };
    expect(smartGroupConditionSchema.safeParse(condition).success).toBe(true);
  });

  it("refuse unknown rules, empty lists, bad keys and dates, and an age without bounds", () => {
    for (const bad of [
      { type: "sql", text: "1=1" }, { type: "plan", planIds: [] }, { type: "and", items: [] },
      { type: "answer", key: "Bad Key", op: "equals", value: "x" }, { type: "joined", op: "before", date: "yesterday" },
      { type: "age", key: "dob" }, { type: "age", key: "dob", min: 30, max: 20 }, { type: "status", statuses: ["MADE_UP"] },
    ]) expect(smartGroupConditionSchema.safeParse(bad).success).toBe(false);
  });

  it("limit how deep and how large a saved condition can be", () => {
    let deep: Condition = rule();
    for (let i = 0; i < MAX_CONDITION_DEPTH; i += 1) deep = { type: "and", items: [deep] };
    expect(smartGroupConditionSchema.safeParse(deep).success).toBe(false);
    const thirty: Condition = { type: "and", items: Array.from({ length: 30 }, rule) };
    const wide: Condition = { type: "or", items: [thirty, thirty, rule()] };
    expect(MAX_CONDITION_NODES).toBeLessThan(63);
    expect(smartGroupConditionSchema.safeParse(wide).success).toBe(false);
    expect(smartGroupConditionSchema.safeParse({ type: "and", items: Array.from({ length: 30 }, rule) }).success).toBe(true);
  });
});

describe("the condition builder model", () => {
  it("round-trips a condition and keeps none-of as a negated any-of", () => {
    const condition: Condition = { type: "and", items: [rule(), { type: "not", item: { type: "or", items: [{ type: "plan", planIds: ["p1"] }, { type: "paymentDue" }] } }] };
    expect(toCondition(fromCondition(condition))).toEqual(condition);
    expect(toCondition(fromCondition({ type: "status", statuses: ["ACTIVE"] }))).toEqual({ type: "and", items: [{ type: "status", statuses: ["ACTIVE"] }] });
  });

  it("is complete only when every condition is filled in", () => {
    expect(isComplete(newGroup("all", []))).toBe(false);
    expect(isComplete(newGroup("all", [newRule("status")]))).toBe(true);
    expect(isComplete(newGroup("all", [newRule("plan")]))).toBe(false);
    expect(isComplete(newGroup("any", [newRule("paymentDue"), newGroup("none", [newRule("plan")])]))).toBe(false);
  });
});
