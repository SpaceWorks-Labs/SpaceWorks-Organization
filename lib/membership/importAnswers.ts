import { resolvePlanAnswers, type QuestionPlan } from "./planAnswers";

/**
 * One imported row's answers, checked against every plan of the organisation as a manager answers them. Pure,
 * so the preview and the import agree. Only filled cells change anything: each replaces its key (dropped when
 * the question is hidden for this member), and conditions read the member's stored answers merged with the row.
 * Answers a changed parent now hides are cleared. Multi-select cells list options separated by ";" only, since
 * options may contain commas.
 */
export function importAnswers(plans: readonly QuestionPlan[], existing: Record<string, unknown>, cells: Record<string, string>): { values: Record<string, unknown> } | { error: string } {
  const definition = (key: string) => plans.flatMap((plan) => plan.fields).find((field) => field.key === key && !field.section);
  for (const [key, cell] of Object.entries(cells)) {
    const field = definition(key);
    if (!field) return { error: "A column is matched to a question no plan asks" };
    const unknown = field.multiple ? cell.split(";").map((part) => part.trim()).find((part) => part && !field.options.includes(part)) : undefined;
    if (unknown !== undefined) return { error: `${field.label}: "${unknown.slice(0, 40)}" isn't one of the choices` };
  }
  const resolved = resolvePlanAnswers(plans, { ...existing, ...cells }, true);
  for (const key of Object.keys(cells)) {
    const error = resolved.errors[`fieldValues.${key}`]?.[0];
    if (error) return { error: `${definition(key)!.label}: ${error}` };
  }
  const values = { ...existing };
  for (const key of Object.keys(cells)) {
    delete values[key];
    if (resolved.values[key] !== undefined) values[key] = resolved.values[key];
  }
  // A changed parent can hide a question answered before: its old answer goes too, as on every other form.
  const before = resolvePlanAnswers(plans, existing, true).visibleKeys;
  for (const key of before) if (!resolved.visibleKeys.has(key)) delete values[key];
  return { values };
}
