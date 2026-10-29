type FieldDef = { key: string; label: string; type: string; required: boolean; options: string[]; adminOnly: boolean };

/**
 * Check answers to a plan's custom questions. Unknown keys are dropped; admin-only questions are kept
 * only when a manager fills the form.
 */
export function validateFieldValues(fields: FieldDef[], values: Record<string, unknown>, byManager: boolean) {
  const clean: Record<string, string | boolean | number> = {};
  const errors: Record<string, string[]> = {};
  for (const field of fields) {
    if (field.adminOnly && !byManager) continue;
    const raw = values[field.key];
    const empty = raw === undefined || raw === null || raw === "" || raw === false;
    if (empty) {
      if (field.required && !(field.adminOnly && !byManager)) errors[`fieldValues.${field.key}`] = [`${field.label} is required`];
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : raw;
    switch (field.type) {
      case "CHECKBOX":
        clean[field.key] = raw === true || raw === "true" || raw === "on";
        break;
      case "NUMBER": {
        const number = typeof text === "number" ? text : Number(text);
        if (!Number.isFinite(number)) errors[`fieldValues.${field.key}`] = ["Enter a number"];
        else clean[field.key] = number;
        break;
      }
      case "SELECT":
        if (typeof text !== "string" || !field.options.includes(text)) errors[`fieldValues.${field.key}`] = ["Choose one of the options"];
        else clean[field.key] = text;
        break;
      case "DATE":
        if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) errors[`fieldValues.${field.key}`] = ["Enter a date"];
        else clean[field.key] = text;
        break;
      case "EMAIL":
        if (typeof text !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) errors[`fieldValues.${field.key}`] = ["Enter a valid email address"];
        else clean[field.key] = text.toLowerCase();
        break;
      default:
        clean[field.key] = String(text).slice(0, field.type === "LONG_TEXT" ? 2000 : 300);
    }
  }
  return { values: clean, errors };
}
