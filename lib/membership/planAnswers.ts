import { orderedFields, sameFieldShape, validateAnswer, type AnswerValues, type FieldDef, type QuestionPlan } from "./planAnswerValues";

export { decodeMultiSelect, encodeMultiSelect } from "./planAnswerValues";
export type { AnswerValue, AnswerValues, FieldDef, QuestionPlan } from "./planAnswerValues";
export { conflictingKeys, validatePlanFieldDefinitions } from "./planFieldDefinitions";

export type AnswerContext = { organisationPlans?: readonly QuestionPlan[] };

/** Pure counterpart of the organisation-wide read: supply every plan, including archived ones. */
export function answerableKeys(plans: readonly QuestionPlan[], byManager: boolean): Set<string> {
  const definitions = new Map<string, FieldDef[]>();
  for (const { fields } of plans) {
    for (const field of fields) definitions.set(field.key, [...(definitions.get(field.key) ?? []), field]);
  }
  return new Set([...definitions].filter(([, fields]) => fields.some((field) => !field.section)
    && (byManager || (!fields.some((field) => field.adminOnly) && fields.every((field) => sameFieldShape(fields[0], field)))))
    .map(([key]) => key));
}

/** Conditions see only validated answers whose key is visible under at least one definition. */
export function resolvePlanAnswers(plans: readonly QuestionPlan[], values: Record<string, unknown>, byManager: boolean, context: AnswerContext = {}) {
  const allowed = answerableKeys([...plans, ...(context.organisationPlans ?? [])], byManager);
  const ordered = plans.map((plan) => orderedFields(plan.fields));
  const visible = new Set<FieldDef>();
  const definitions = new Map<string, FieldDef>();
  const checked = new Map<string, ReturnType<typeof validateAnswer>>();
  const clean: AnswerValues = {};
  let changed = true;
  while (changed) {
    changed = false;
    for (const fields of ordered) {
      for (const [index, field] of fields.entries()) {
        if (visible.has(field) || field.section || !allowed.has(field.key) || (field.adminOnly && !byManager)) continue;
        if (field.showIfKey != null || field.showIfValue != null) {
          const parent = fields.slice(0, index).find((entry) => entry.key === field.showIfKey);
          if (!parent || parent.section || parent.multiple || !["SELECT", "CHECKBOX"].includes(parent.type)) continue;
          const answer = checked.get(parent.key)?.value;
          if (answer === undefined || String(answer) !== field.showIfValue) continue;
        }
        visible.add(field);
        changed = true;
        if (!definitions.has(field.key)) {
          definitions.set(field.key, field);
          const answer = validateAnswer(field, Object.hasOwn(values, field.key) ? values[field.key] : undefined);
          checked.set(field.key, answer);
          if (answer.value !== undefined) clean[field.key] = answer.value;
        }
      }
    }
  }
  const required = new Set([...visible].filter((field) => field.required).map((field) => field.key));
  const errors: Record<string, string[]> = {};
  for (const [key, field] of definitions) {
    const answer = checked.get(key)!;
    const error = answer.error ?? (required.has(key) && answer.value === undefined ? `${field.label} is required` : undefined);
    if (error) errors[`fieldValues.${key}`] = [error];
  }
  return { values: clean, errors, visibleKeys: new Set(definitions.keys()), requiredKeys: required, visibleFields: visible as ReadonlySet<FieldDef> };
}

export function validatePlanAnswers(fields: readonly FieldDef[], values: Record<string, unknown>, byManager: boolean, context?: AnswerContext) {
  const { values: clean, errors } = resolvePlanAnswers([{ fields }], values, byManager, context);
  return { values: clean, errors };
}

/** Replace exactly this union's answerable keys; hidden and empty answers clear their old values. */
export function replaceUnionAnswers(existing: Record<string, unknown>, plans: readonly QuestionPlan[], values: Record<string, unknown>, byManager: boolean, context: AnswerContext = {}) {
  const allowed = answerableKeys([...plans, ...(context.organisationPlans ?? [])], byManager);
  const result = { ...existing };
  for (const { fields } of plans) {
    for (const field of fields) if (!field.section && allowed.has(field.key)) delete result[field.key];
  }
  return Object.assign(result, resolvePlanAnswers(plans, values, byManager, context).values);
}

export function replacePlanAnswers(existing: Record<string, unknown>, fields: readonly FieldDef[], values: Record<string, unknown>, byManager: boolean, context?: AnswerContext) {
  return replaceUnionAnswers(existing, [{ fields }], values, byManager, context);
}
