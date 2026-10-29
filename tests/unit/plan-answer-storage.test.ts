import { describe, expect, it } from "vitest";
import {
  answerableKeys, decodeMultiSelect, encodeMultiSelect, replacePlanAnswers, replaceUnionAnswers,
  validatePlanFieldDefinitions, type FieldDef,
} from "@/lib/membership/planAnswers";
import { validateFieldValues } from "@/lib/membership/validators";
import { readRow } from "@/lib/membership/importMapping";
import { validateFieldValues as validateOldFieldValues } from "@/tests/fixtures/validateFieldValues-0.8.0";

const field = (key: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label: key, type: "TEXT", required: false, options: [], adminOnly: false, ...extra });
const multiple = field("choices", { type: "LONG_TEXT", multiple: true, options: ["A", "B", "C, D"] });

describe("multiple choices", () => {
  it("removes duplicates and unknown parts, using option order", () => {
    expect(encodeMultiSelect(multiple.options, ["B", "A", "B", "invalid"])).toBe("A; B");
    expect(decodeMultiSelect(multiple.options, "B; invalid; A; B")).toEqual(["A", "B"]);
    expect(validateFieldValues([multiple], { choices: ["invalid", "B", "B", "A"] }, false)).toEqual({ values: { choices: "A; B" }, errors: {} });
    expect(validateFieldValues([multiple], { choices: "A; removed; B" }, false).values).toEqual({ choices: "A; B" });
  });

  it("reads a legacy single selection and round trips the stored string", () => {
    expect(decodeMultiSelect(multiple.options, "C, D")).toEqual(["C, D"]);
    const stored = encodeMultiSelect(multiple.options, ["C, D", "A"]);
    expect(stored).toBe("A; C, D");
    expect(encodeMultiSelect(multiple.options, decodeMultiSelect(multiple.options, stored))).toBe(stored);
  });

  it("clears empty answers and requires a non-empty valid selection when required", () => {
    for (const choices of [undefined, null, "", " ; ", [], "unknown", ["unknown"]]) {
      expect(validateFieldValues([multiple], { choices }, false)).toEqual({ values: {}, errors: {} });
      expect(validateFieldValues([{ ...multiple, required: true }], { choices }, false).errors).toEqual({ "fieldValues.choices": ["choices is required"] });
    }
  });

  it("refuses wrong input types and never coerces objects or numbers to options", () => {
    for (const choices of [true, false, 42, {}, ["A", 1], [null]]) {
      expect(() => encodeMultiSelect(multiple.options, choices)).toThrow(/options/);
      expect(validateFieldValues([multiple], { choices }, false)).toEqual({ values: {}, errors: { "fieldValues.choices": ["Choose from the options"] } });
    }
    expect(decodeMultiSelect(multiple.options, {})).toEqual([]);
  });

  it("refuses semicolons in options and encoded strings over 2000 characters", () => {
    expect(() => encodeMultiSelect(["A; B", "C"], "C")).toThrow(/semicolons/);
    const options = Array.from({ length: 30 }, (_, i) => String(i).padEnd(80, "x"));
    expect(() => encodeMultiSelect(options, options)).toThrow(/2000/);
    expect(validateFieldValues([{ ...multiple, options }], { choices: options }, false).values).toEqual({});
    expect(encodeMultiSelect(["a".repeat(1000), "b".repeat(998)], ["a".repeat(1000), "b".repeat(998)])).toHaveLength(2000);
  });

  it("splits import cells on semicolons only, preserving commas and round trips", () => {
    const imported = readRow(["Example Member", "member@example.test", "C, D; A"], ["name", "email", "field:choices"]);
    expect("error" in imported).toBe(false);
    if ("error" in imported) throw new Error(imported.error);
    const saved = validateFieldValues([multiple], imported.fieldValues, false);
    expect(saved).toEqual({ values: { choices: "A; C, D" }, errors: {} });
    expect(decodeMultiSelect(multiple.options, saved.values.choices)).toEqual(["A", "C, D"]);
    expect(decodeMultiSelect(["A", "B"], "A, B")).toEqual([]);
  });

  it("passes the stored answer unchanged through the original 0.8.0 validator", () => {
    const legacyField = { key: "choices", label: "Choices", type: "LONG_TEXT", required: true, options: ["A", "B"], adminOnly: false };
    expect(validateOldFieldValues([legacyField], { choices: "A; B" }, false)).toEqual({ values: { choices: "A; B" }, errors: {} });
  });
});

describe("shared key safety", () => {
  it("makes a key admin-only everywhere, including other and archived plans", () => {
    const fields = [field("shared"), field("public")];
    const organisationPlans = [{ fields: [field("shared", { adminOnly: true })] }];
    expect(answerableKeys([{ fields }, ...organisationPlans], false)).toEqual(new Set(["public"]));
    expect(answerableKeys([{ fields }, ...organisationPlans], true)).toEqual(new Set(["shared", "public"]));
    expect(validateFieldValues(fields, { shared: "crafted", public: "ok" }, false, { organisationPlans })).toEqual({ values: { public: "ok" }, errors: {} });
  });

  it("refuses different shapes or admin settings on definition save", () => {
    const base = field("shared", { type: "SELECT", options: ["A", "B"] });
    for (const extra of [{ type: "TEXT" }, { options: ["A", "C"] }, { options: ["B", "A"] }, { multiple: true }, { section: true }, { adminOnly: true }]) {
      expect(validatePlanFieldDefinitions([base], [{ fields: [{ ...base, ...extra }] }])).toContainEqual({ path: [0, "key"], message: "Another plan uses this key differently" });
    }
    expect(validatePlanFieldDefinitions([base], [{ fields: [{ ...base, label: "Different label", required: true, showIfKey: "parent", showIfValue: "A" }] }])).toEqual([]);
    expect(validatePlanFieldDefinitions([field("text", { options: ["unused"] })], [{ fields: [field("text")] }])).toEqual([]);
  });

  it("blocks public writes to existing shape conflicts but allows staff to answer a plan", () => {
    const fields = [field("shared")];
    const organisationPlans = [{ fields: [field("shared", { type: "NUMBER" })] }];
    expect(answerableKeys([{ fields }, ...organisationPlans], false).has("shared")).toBe(false);
    expect(validateFieldValues(fields, { shared: "crafted" }, false, { organisationPlans }).values).toEqual({});
    expect(validateFieldValues(fields, { shared: "staff" }, true, { organisationPlans }).values).toEqual({ shared: "staff" });
    const shapes = [{ multiple: false }, { section: true }, { options: ["X", "Y"] }];
    for (const shape of shapes) {
      expect(answerableKeys([{ fields: [multiple, { ...multiple, ...shape, multiple: shape.multiple ?? false }] }], false).has("choices")).toBe(false);
    }
  });
});

describe("answer replacement", () => {
  const fields = [
    field("parent", { type: "SELECT", options: ["A", "B"] }),
    field("child", { showIfKey: "parent", showIfValue: "A" }),
    field("empty"), field("secret", { adminOnly: true }), field("heading", { section: true }),
  ];
  const existing = { parent: "A", child: "old", empty: "old", secret: "staff", heading: "legacy", other_plan: "keep", unknown: { keep: true } };

  it("sets and clears exactly a plan's answerable keys, preserving everything else", () => {
    expect(replacePlanAnswers(existing, fields, { parent: "B", child: "crafted", empty: "  ", secret: "crafted", other_plan: "crafted" }, false)).toEqual({
      parent: "B", secret: "staff", heading: "legacy", other_plan: "keep", unknown: { keep: true },
    });
    expect(existing.child).toBe("old");
    expect(replacePlanAnswers(existing, fields, { parent: "A", child: "new" }, true)).toEqual({ parent: "A", child: "new", heading: "legacy", other_plan: "keep", unknown: { keep: true } });
  });

  it("preserves keys blocked by other plans' admin flags or shape collisions", () => {
    const organisationPlans = [{ fields: [field("empty", { adminOnly: true }), field("parent", { type: "NUMBER" })] }];
    expect(replacePlanAnswers(existing, fields, {}, false, { organisationPlans })).toEqual({
      parent: "A", empty: "old", secret: "staff", heading: "legacy", other_plan: "keep", unknown: { keep: true },
    });
  });

  it("replaces the union once and clears answers when all definitions hide a key", () => {
    const plans = [{ fields }, { fields: [field("parent", { type: "SELECT", options: ["A", "B"] }), field("child")] }];
    expect(replaceUnionAnswers(existing, plans, { parent: "B", child: "visible elsewhere" }, false)).toEqual({
      parent: "B", child: "visible elsewhere", secret: "staff", heading: "legacy", other_plan: "keep", unknown: { keep: true },
    });
    expect(replaceUnionAnswers(existing, [{ fields }], { parent: "B", child: "crafted" }, false)).not.toHaveProperty("child");
  });
});
