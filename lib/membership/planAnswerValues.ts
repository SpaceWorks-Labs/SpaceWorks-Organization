export type FieldDef = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: readonly string[];
  adminOnly: boolean;
  multiple?: boolean;
  section?: boolean;
  showIfKey?: string | null;
  showIfValue?: string | null;
  sortOrder?: number;
};
export type AnswerValue = string | boolean | number;
export type AnswerValues = Record<string, AnswerValue>;
export type QuestionPlan = { fields: readonly FieldDef[] };

/** Stored answers and import cells share the same separator; commas belong to options. */
export function decodeMultiSelect(options: readonly string[], value: unknown): string[] {
  const parts = typeof value === "string" ? value.split(";").map((part) => part.trim()) : Array.isArray(value) ? value : [];
  const chosen = new Set(parts);
  return [...new Set(options)].filter((option) => chosen.has(option));
}

export function encodeMultiSelect(options: readonly string[], value: unknown): string {
  if (options.some((option) => option.includes(";"))) throw new Error("Choices cannot contain semicolons");
  if (value !== undefined && value !== null && typeof value !== "string" && !(Array.isArray(value) && value.every((part) => typeof part === "string"))) {
    throw new Error("Choose from the options");
  }
  const text = decodeMultiSelect(options, value).join("; ");
  if (text.length > 2000) throw new Error("Choose options totalling at most 2000 characters");
  return text;
}

export function validateAnswer(field: FieldDef, raw: unknown): { value?: AnswerValue; error?: string } {
  if (field.section) return {};
  if (field.multiple) {
    if (field.type !== "LONG_TEXT") return { error: "Multiple choices need a long-text question" };
    try {
      return { value: encodeMultiSelect(field.options, raw) || undefined };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }
  const text = typeof raw === "string" ? raw.trim() : raw;
  if (text === undefined || text === null || text === "" || text === false) return {};
  switch (field.type) {
    case "CHECKBOX":
      if (raw === true || text === "true" || text === "on") return { value: true };
      if (text === "false" || text === "off") return {};
      return { error: "Tick the checkbox" };
    case "NUMBER": {
      const number = typeof text === "number" ? text : typeof text === "string" ? Number(text) : NaN;
      return Number.isFinite(number) ? { value: number } : { error: "Enter a number" };
    }
    case "SELECT":
      return typeof text === "string" && field.options.includes(text) ? { value: text } : { error: "Choose one of the options" };
    case "DATE":
      return typeof text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(text) ? { value: text } : { error: "Enter a date" };
    case "EMAIL":
      return typeof text === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? { value: text.toLowerCase() } : { error: "Enter a valid email address" };
    default:
      return typeof text === "string" ? { value: text.slice(0, field.type === "LONG_TEXT" ? 2000 : 300) } : { error: "Enter text" };
  }
}

export function orderedFields(fields: readonly FieldDef[]): FieldDef[] {
  return [...fields].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export function sameFieldShape(a: FieldDef, b: FieldDef): boolean {
  return a.type === b.type && !!a.multiple === !!b.multiple && !!a.section === !!b.section
    && (!(a.type === "SELECT" || a.multiple) || JSON.stringify(a.options) === JSON.stringify(b.options));
}
