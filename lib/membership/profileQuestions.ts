import { answerableKeys, resolvePlanAnswers, type FieldDef } from "./planAnswers";
import { orderedFields } from "./planAnswerValues";

/**
 * Profile editing (staff and the member portal) over the union of a member's plans. Pure and client-safe, so
 * the forms show exactly what the server validates and writes.
 */

export type QuestionField = FieldDef & { helpText: string };
export type ProfilePlan = { id: string; fields: QuestionField[] };
export type ProfileItem = { kind: "section"; field: QuestionField } | { kind: "question"; field: QuestionField; required: boolean };

/**
 * The chosen plans, cut down to the questions this actor may answer across every plan of the organisation
 * (`organisationPlans`), plus their section headings. Admin-only-anywhere keys never reach a member.
 */
export function answerablePlans<P extends ProfilePlan>(organisationPlans: readonly P[], chosen: readonly P[], byManager: boolean): ProfilePlan[] {
  const allowed = answerableKeys(organisationPlans, byManager);
  return chosen.map((plan) => ({ id: plan.id, fields: plan.fields.filter((field) => (field.section ? byManager || !field.adminOnly : allowed.has(field.key))) }));
}

/** Only the stored answers the form may show and edit. */
export function answersFor(plans: readonly ProfilePlan[], values: unknown): Record<string, string | boolean | number> {
  const record = values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
  const keys = new Set(plans.flatMap((plan) => plan.fields.filter((field) => !field.section).map((field) => field.key)));
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => keys.has(key) && ["string", "boolean", "number"].includes(typeof value))) as Record<string, string | boolean | number>;
}

/**
 * The visible questions, one per key, in plan order then question order, each under its section heading. A
 * heading shows only when a visible question follows it in its plan.
 */
export function profileQuestions(plans: readonly ProfilePlan[], values: Record<string, unknown>, byManager: boolean): ProfileItem[] {
  const { visibleFields, requiredKeys } = resolvePlanAnswers(plans, values, byManager);
  const items: ProfileItem[] = [];
  const seen = new Set<string>();
  for (const plan of plans) {
    let heading: QuestionField | null = null;
    for (const field of orderedFields(plan.fields) as QuestionField[]) {
      if (field.section) heading = field;
      else if (visibleFields.has(field) && !seen.has(field.key)) {
        if (heading && !seen.has(`section:${heading.key}`)) items.push({ kind: "section", field: heading });
        if (heading) seen.add(`section:${heading.key}`);
        heading = null;
        seen.add(field.key);
        items.push({ kind: "question", field, required: requiredKeys.has(field.key) });
      }
    }
  }
  return items;
}
