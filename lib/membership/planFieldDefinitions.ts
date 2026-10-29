import { orderedFields, sameFieldShape, type FieldDef, type QuestionPlan } from "./planAnswerValues";

/** The caller supplies other plans from the same organisation, excluding the plan being saved. */
export function validatePlanFieldDefinitions(fields: readonly FieldDef[], otherPlans: readonly QuestionPlan[] = []) {
  const issues: { path: [number, string]; message: string }[] = [];
  const previous = new Map<string, FieldDef>();
  const add = (field: FieldDef, key: string, message: string) => issues.push({ path: [fields.indexOf(field), key], message });
  for (const field of orderedFields(fields)) {
    if (previous.has(field.key)) add(field, "key", "Each question needs its own key");
    if (field.section && (field.type !== "TEXT" || field.required || field.multiple)) add(field, "section", "Sections must be optional text headings");
    if (field.multiple && field.type !== "LONG_TEXT") add(field, "multiple", "Multiple choices need a long-text question");
    if ((field.type === "SELECT" || field.multiple) && field.options.length < 2) add(field, "options", "Give at least two choices");
    if (field.multiple && field.options.some((option) => option.includes(";"))) add(field, "options", "Choices cannot contain semicolons");
    const hasKey = field.showIfKey !== undefined && field.showIfKey !== null;
    const hasValue = field.showIfValue !== undefined && field.showIfValue !== null;
    if (hasKey !== hasValue) add(field, "showIfKey", "Choose both a parent question and an answer");
    if (hasKey && hasValue) {
      const parent = previous.get(field.showIfKey!);
      if (!parent) add(field, "showIfKey", "Choose an earlier question");
      else if (parent.section || parent.multiple || !["SELECT", "CHECKBOX"].includes(parent.type)) add(field, "showIfKey", "The parent must be a select or checkbox question");
      else {
        if (parent.type === "CHECKBOX" ? field.showIfValue !== "true" : !parent.options.includes(field.showIfValue!)) add(field, "showIfValue", "Choose one of the parent's answers");
        if (!field.adminOnly && parent.adminOnly) add(field, "showIfKey", "Public questions cannot depend on admin-only questions");
      }
    }
    if (otherPlans.some((plan) => plan.fields.some((other) => other.key === field.key && (!sameFieldShape(field, other) || field.adminOnly !== other.adminOnly)))) {
      add(field, "key", "Another plan uses this key differently");
    }
    previous.set(field.key, field);
  }
  return issues;
}

/** Keys the organisation's plans (archived ones too) define with different shapes or admin-only settings. */
export function conflictingKeys(plans: readonly QuestionPlan[]): string[] {
  const first = new Map<string, FieldDef>();
  const conflicts = new Set<string>();
  for (const field of plans.flatMap((plan) => plan.fields)) {
    const seen = first.get(field.key);
    if (!seen) first.set(field.key, field);
    else if (!sameFieldShape(seen, field) || seen.adminOnly !== field.adminOnly) conflicts.add(field.key);
  }
  return [...conflicts].sort();
}
