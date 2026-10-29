import { describe, expect, it } from "vitest";
import { answerablePlans, answersFor, profileQuestions, type ProfilePlan, type QuestionField } from "@/lib/membership/profileQuestions";
import { importAnswers } from "@/lib/membership/importAnswers";
import { checkImportRows } from "@/lib/membership/importRows";
import { mappingIsUsable, readRow, type ImportTarget } from "@/lib/membership/importMapping";
import { memberDetails } from "@/lib/cards/core";

const q = (key: string, extra: Partial<QuestionField> = {}): QuestionField => ({ key, label: key, helpText: "", type: "TEXT", required: false, options: [], adminOnly: false, ...extra });
const STACKS = ["Rust, Go", "TypeScript", "Python"];
const plans: ProfilePlan[] = [
  { id: "a", fields: [q("intro", { section: true, sortOrder: 0 }), q("employed", { type: "CHECKBOX", sortOrder: 1 }), q("score", { adminOnly: true, sortOrder: 2 })] },
  { id: "b", fields: [q("employed", { type: "CHECKBOX", sortOrder: 0 }), q("company", { showIfKey: "employed", showIfValue: "true", required: true, sortOrder: 1 }), q("work", { section: true, sortOrder: 2 }), q("stack", { type: "LONG_TEXT", multiple: true, options: STACKS, sortOrder: 3 })] },
  { id: "c", fields: [q("company", { type: "NUMBER" }), q("score")] },
];

describe("profile questions across plans", () => {
  it("never gives members a key that is admin-only or shaped differently on any plan", () => {
    const member = answerablePlans(plans, plans.slice(0, 2), false);
    expect(member.flatMap((plan) => plan.fields.map((field) => field.key))).toEqual(["intro", "employed", "employed", "work", "stack"]);
    expect(answerablePlans(plans, plans.slice(0, 2), true)[0].fields.map((field) => field.key)).toEqual(["intro", "employed", "score"]);
    expect(answersFor(member, { employed: true, score: "9/10", company: "Acme", stack: "TypeScript", nested: { a: 1 } })).toEqual({ employed: true, stack: "TypeScript" });
  });

  it("shows each key once, lets a parent in one plan show a question in another, and heads only shown sections", () => {
    const union = answerablePlans(plans, plans.slice(0, 2), true);
    const shown = (values: Record<string, unknown>) => profileQuestions(union, values, true).map((item) => `${item.kind === "section" ? "#" : ""}${item.field.key}${item.kind === "question" && item.required ? "*" : ""}`);
    expect(shown({})).toEqual(["#intro", "employed", "score", "#work", "stack"]);
    expect(shown({ employed: true })).toEqual(["#intro", "employed", "score", "company*", "#work", "stack"]);
  });
});

describe("importing answers", () => {
  const all = plans.slice(0, 2);

  it("splits multi-select cells on semicolons only, keeping commas inside options", () => {
    const result = importAnswers(all, {}, { stack: "Python; Rust, Go" });
    expect(result).toEqual({ values: { stack: "Rust, Go; Python" } });
    expect(importAnswers(all, {}, { stack: "Rust; Go" })).toEqual({ error: 'stack: "Rust" isn\'t one of the choices' });
    expect(memberDetails([{ key: "stack", label: "Stack", type: "LONG_TEXT", multiple: true, options: STACKS }, { key: "work", label: "Work", type: "TEXT", section: true }], { ...("values" in result ? result.values : {}), work: "x" }))
      .toEqual([{ key: "stack", label: "Stack", value: "Rust, Go, Python" }]);
  });

  it("changes only filled cells, reads conditions from stored answers and drops hidden ones", () => {
    expect(importAnswers(all, { employed: true, other: "kept" }, { company: "Acme" })).toEqual({ values: { employed: true, other: "kept", company: "Acme" } });
    expect(importAnswers(all, { company: "Old" }, { company: "Acme" })).toEqual({ values: {} });
    expect(importAnswers(all, {}, { employed: "maybe" })).toEqual({ error: "employed: Tick the checkbox" });
  });

  it("flags the same rows in the preview as the import, and never maps sections", () => {
    const mapping: ImportTarget[] = ["name", "email", "field:stack"];
    const rows = [["Asha Menon", "asha@example.test", "Rust, Go"], ["Ravi K", "ravi@example.test", "Go"]];
    const checked = checkImportRows(rows, mapping, { units: [], roles: [], scopePath: null, answers: { plans: all, stored: new Map() } });
    expect(checked.problems).toEqual([{ row: 3, reason: 'stack: "Go" isn\'t one of the choices' }]);
    const row = readRow(rows[0], mapping);
    expect("error" in row ? null : importAnswers(all, {}, row.fieldValues)).toEqual({ values: { stack: "Rust, Go" } });
    const keys = new Set(["employed", "stack"]);
    expect(mappingIsUsable(["name", "email", "field:work"], keys)).toMatch(/questions a plan asks/);
    expect(mappingIsUsable(mapping, keys)).toBeNull();
  });
});
