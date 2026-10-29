export type FieldType = "TEXT" | "LONG_TEXT" | "SELECT" | "DATE" | "EMAIL" | "PHONE" | "NUMBER" | "CHECKBOX";

export type QuestionValue = {
  key: string;
  label: string;
  helpText: string;
  type: FieldType;
  required: boolean;
  options: string[];
  adminOnly: boolean;
  multiple: boolean;
  section: boolean;
  showIfKey: string | null;
  showIfValue: string | null;
};

/** What the editor offers. "Choose several" is stored as a long-text question with choices, a section as text. */
export type QuestionKind = FieldType | "MULTIPLE" | "SECTION";

export const KINDS: Array<[QuestionKind, string]> = [
  ["TEXT", "Short answer"], ["LONG_TEXT", "Paragraph"], ["SELECT", "Choose one"], ["MULTIPLE", "Choose several"],
  ["DATE", "Date"], ["EMAIL", "Email"], ["PHONE", "Phone"], ["NUMBER", "Number"], ["CHECKBOX", "Tick box"],
  ["SECTION", "Section heading"],
];

export const kindOf = (field: QuestionValue): QuestionKind => (field.section ? "SECTION" : field.multiple ? "MULTIPLE" : field.type);

export function kindPatch(kind: QuestionKind): Partial<QuestionValue> {
  if (kind === "SECTION") return { type: "TEXT", section: true, multiple: false, required: false, showIfKey: null, showIfValue: null };
  if (kind === "MULTIPLE") return { type: "LONG_TEXT", section: false, multiple: true };
  return { type: kind, section: false, multiple: false };
}

export const hasChoices = (field: QuestionValue) => field.type === "SELECT" || field.multiple;

/** Earlier questions a condition can follow: single-choice selects and tick boxes. */
export const canLeadTo = (field: QuestionValue) => !field.section && !field.multiple && (field.type === "SELECT" || field.type === "CHECKBOX");

export function keyFrom(label: string, taken: string[]) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "q_$1").slice(0, 32) || "question";
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base}_${n}`;
  return key;
}

export const blankQuestion = (taken: string[]): QuestionValue => ({
  key: keyFrom("question", taken), label: "", helpText: "", type: "TEXT", required: false, options: [], adminOnly: false,
  multiple: false, section: false, showIfKey: null, showIfValue: null,
});
