import { describe, expect, it } from "vitest";
import { answerableKeys, resolvePlanAnswers, validatePlanFieldDefinitions, type FieldDef } from "@/lib/membership/planAnswers";
import { planFieldSchema, planFieldsSchema, validateFieldValues } from "@/lib/membership/validators";

const field = (key: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label: key, type: "TEXT", required: false, options: [], adminOnly: false, ...extra });
const select = (key: string, extra: Partial<FieldDef> = {}) => field(key, { type: "SELECT", options: ["A", "B"], ...extra });
const when = (showIfKey: string, showIfValue = "A") => ({ showIfKey, showIfValue });

describe("question visibility", () => {
  const fields = [select("parent"), select("middle", when("parent")), field("child", { ...when("middle"), required: true })];

  it("follows chains and drops crafted answers behind a hidden parent", () => {
    expect(validateFieldValues(fields, { parent: "B", middle: "A", child: "crafted" }, false)).toEqual({ values: { parent: "B" }, errors: {} });
    expect(validateFieldValues(fields, { parent: "A", middle: "A", child: "shown", unknown: "ignored" }, false)).toEqual({ values: { parent: "A", middle: "A", child: "shown" }, errors: {} });
    expect(validateFieldValues(fields, { parent: "A", middle: "A" }, false).errors).toEqual({ "fieldValues.child": ["child is required"] });
  });

  it("never uses invalid or inherited parent answers to expose children", () => {
    for (const parent of ["invalid", ["A"], true, {}]) {
      const result = validateFieldValues(fields, { parent, middle: "A", child: "crafted" }, false);
      expect(result.values).toEqual({});
      expect(Object.keys(result.errors)).toEqual(["fieldValues.parent"]);
    }
    const inherited = Object.create({ parent: "A", middle: "A" });
    expect(validateFieldValues(fields, inherited, false).values).toEqual({});
  });

  it("uses a validated checkbox value and applies server sort order", () => {
    const fields = [field("child", { ...when("parent", "true"), sortOrder: 2 }), field("parent", { type: "CHECKBOX", sortOrder: 1 })];
    expect(validateFieldValues(fields, { parent: "on", child: "yes" }, false).values).toEqual({ parent: true, child: "yes" });
    expect(validateFieldValues(fields, { parent: "garbage", child: "crafted" }, false).values).toEqual({});
    expect(validateFieldValues(fields, { parent: false, child: "crafted" }, false).values).toEqual({});
  });

  it("does not expose a public child of an unavailable admin parent", () => {
    expect(validateFieldValues([select("parent", { adminOnly: true }), field("child", when("parent"))], { parent: "A", child: "crafted" }, false)).toEqual({ values: {}, errors: {} });
  });

  it("never answers or requires section headings", () => {
    const fields = [field("heading", { section: true, required: true }), field("answer")];
    expect(validateFieldValues(fields, { heading: "crafted", answer: "yes" }, true)).toEqual({ values: { answer: "yes" }, errors: {} });
    expect(answerableKeys([{ fields }], true)).toEqual(new Set(["answer"]));
  });
});

describe("union visibility", () => {
  it("iterates to use a shared parent visible in a later plan", () => {
    const plans = [
      { fields: [select("gate"), select("parent", when("gate")), field("child", { ...when("parent"), required: true })] },
      { fields: [select("parent")] },
    ];
    const result = resolvePlanAnswers(plans, { parent: "A", child: "shown" }, false);
    expect(result.values).toEqual({ parent: "A", child: "shown" });
    expect(result.requiredKeys).toEqual(new Set(["child"]));
    expect(result.visibleKeys).toEqual(new Set(["gate", "parent", "child"]));
    expect(result.errors).toEqual({});
    expect(resolvePlanAnswers(plans, { parent: "A" }, false).errors).toHaveProperty("fieldValues.child");
  });

  it("requires a shared key only under a visible required definition and validates it once", () => {
    const plans = [
      { fields: [select("parent"), field("shared", { required: true, ...when("parent") })] },
      { fields: [field("shared")] },
    ];
    expect(resolvePlanAnswers(plans, { parent: "B" }, false).errors).toEqual({});
    expect(resolvePlanAnswers(plans, { parent: "A" }, false).errors).toEqual({ "fieldValues.shared": ["shared is required"] });
    expect(resolvePlanAnswers(plans, { parent: "A", shared: "done" }, false).values).toEqual({ parent: "A", shared: "done" });
  });

  it("never bootstraps cross-plan cycles from crafted answers", () => {
    const plans = [
      { fields: [select("gate"), select("a", when("gate")), select("b", when("a"))] },
      { fields: [select("gate"), select("b", when("gate")), select("a", when("b"))] },
    ];
    expect(resolvePlanAnswers(plans, { a: "A", b: "A" }, false).values).toEqual({});
  });
});

describe("definition saves", () => {
  const check = (fields: FieldDef[]) => validatePlanFieldDefinitions(fields);

  it("accepts select and checkbox parents and chains", () => {
    expect(check([select("parent"), select("middle", when("parent")), field("child", when("middle"))])).toEqual([]);
    expect(check([field("parent", { type: "CHECKBOX" }), field("child", when("parent", "true"))])).toEqual([]);
  });

  it("refuses forward, self and missing references, including deletion and reorder", () => {
    for (const fields of [[field("child", when("parent")), select("parent")], [select("parent", when("parent"))], [field("child", when("deleted"))]]) {
      expect(check(fields)).toContainEqual({ path: [0, "showIfKey"], message: "Choose an earlier question" });
    }
    expect(check([select("parent", { sortOrder: 2 }), field("child", { ...when("parent"), sortOrder: 1 })])).not.toEqual([]);
  });

  it("refuses invalid parent shapes or answers and public dependence on an admin question", () => {
    for (const type of ["TEXT", "LONG_TEXT", "DATE", "EMAIL", "PHONE", "NUMBER"]) {
      expect(check([field("parent", { type }), field("child", when("parent"))])[0].path).toEqual([1, "showIfKey"]);
    }
    expect(check([select("parent"), field("child", when("parent", "C"))])[0].path).toEqual([1, "showIfValue"]);
    expect(check([field("parent", { type: "CHECKBOX" }), field("child", when("parent", "false"))])[0].path).toEqual([1, "showIfValue"]);
    expect(check([select("parent", { adminOnly: true }), field("child", when("parent"))])[0].path).toEqual([1, "showIfKey"]);
    expect(check([select("parent", { adminOnly: true }), field("child", { ...when("parent"), adminOnly: true })])).toEqual([]);
    expect(check([field("parent", { section: true }), field("child", when("parent"))])).not.toEqual([]);
  });

  it("requires both condition columns and validates shape flags", () => {
    for (const extra of [{ showIfKey: "parent" }, { showIfValue: "A" }, { showIfKey: "parent", showIfValue: null }]) {
      expect(check([select("parent"), field("child", extra)])).not.toEqual([]);
    }
    for (const extra of [{ multiple: true }, { section: true, required: true }, { section: true, type: "NUMBER" }]) {
      expect(check([field("question", extra)])).not.toEqual([]);
    }
    expect(check([field("heading", { section: true })])).toEqual([]);
    expect(check([select("parent"), select("parent")])).not.toEqual([]);
  });

  it("enforces conditions and multiple options through the existing schema", () => {
    const save = (fields: FieldDef[]) => planFieldsSchema.safeParse({ organisationSlug: "demo", planId: "p", fields });
    expect(planFieldSchema.parse(field("plain"))).toMatchObject({ multiple: false, section: false, showIfKey: null, showIfValue: null });
    expect(save([select("parent"), field("child", when("parent"))]).success).toBe(true);
    expect(save([field("child", when("missing"))]).success).toBe(false);
    expect(save([field("choices", { type: "LONG_TEXT", multiple: true, options: ["A; B", "C"] })]).success).toBe(false);
    expect(save([field("choices", { type: "LONG_TEXT", multiple: true, options: ["A"] })]).success).toBe(false);
    expect(save([select("parent", { options: [] })]).success).toBe(false);
  });
});
