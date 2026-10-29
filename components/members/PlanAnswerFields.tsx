"use client";

import { useId } from "react";
import { decodeMultiSelect } from "@/lib/membership/planAnswerValues";
import { profileQuestions, type ProfilePlan, type QuestionField } from "@/lib/membership/profileQuestions";
import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, Input, ReadOnlyValue, Textarea } from "@/components/ui/field";

export type AnswerState = Record<string, string | boolean | number>;

const INPUT_TYPES: Record<string, string> = { DATE: "date", NUMBER: "number", EMAIL: "email", PHONE: "tel" };

/** Tick boxes for a multi-select question; the answer is the stored "A; B" string, in option order. */
function MultiSelect({ field, value, required, error, disabled, onAnswer }: { field: QuestionField; value: unknown; required: boolean; error?: string; disabled?: boolean; onAnswer: (value: string) => void }) {
  const id = useId();
  const chosen = decodeMultiSelect(field.options, value);
  if (disabled) return <Field label={field.label} className="sm:col-span-2"><ReadOnlyValue value={chosen.join(", ") || "Not answered"} /></Field>;
  const toggle = (option: string, on: boolean) => onAnswer(field.options.filter((entry) => (entry === option ? on : chosen.includes(entry))).join("; "));
  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={error || field.helpText ? `${id}-description` : undefined} className="flex flex-col gap-2 sm:col-span-2">
      <span id={`${id}-label`} className="text-label text-ink">
        {field.label}
        {required ? null : <span className="ml-1.5 font-normal text-ink-muted">Optional</span>}
      </span>
      {field.options.map((option) => <CheckboxField key={option} checked={chosen.includes(option)} onCheckedChange={(checked) => toggle(option, checked === true)} label={option} />)}
      {error || field.helpText ? <p id={`${id}-description`} className={error ? "text-caption text-danger-fg" : "text-caption text-ink-muted"}>{error || field.helpText}</p> : null}
    </div>
  );
}

/**
 * The questions of a member's plans, one per key, shown and hidden by their conditions as answers change.
 * Sections are headings. `byManager` adds admin-only questions (staff forms).
 */
export function PlanAnswerFields({ plans, values, errors, byManager, disabled, onAnswer }: {
  plans: ProfilePlan[]; values: AnswerState; errors: Record<string, string[] | undefined>; byManager: boolean; disabled?: boolean;
  onAnswer: (key: string, value: string | boolean) => void;
}) {
  const items = profileQuestions(plans, values, byManager);
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {items.map((item) => {
        const { field } = item;
        if (item.kind === "section") return (
          <div key={`section:${field.key}`} className="flex flex-col gap-1 sm:col-span-2">
            <h3 className="text-label font-semibold text-ink">{field.label}</h3>
            {field.helpText ? <p className="text-caption text-ink-muted">{field.helpText}</p> : null}
          </div>
        );
        const value = values[field.key];
        const error = errors[`fieldValues.${field.key}`]?.[0];
        const hint = field.helpText || undefined;
        const common = { label: field.label, required: item.required, optional: !item.required, helperText: hint, error };
        const answer = (next: string | boolean) => onAnswer(field.key, next);
        if (field.multiple) return <MultiSelect key={field.key} field={field} value={value} required={item.required} error={error} disabled={disabled} onAnswer={answer} />;
        if (field.type === "CHECKBOX") return <CheckboxField key={field.key} checked={value === true} disabled={disabled} onCheckedChange={(checked) => answer(checked === true)} label={field.label} description={hint} />;
        if (field.type === "SELECT") return (
          <Field key={field.key} {...common}>
            <Dropdown value={String(value ?? "")} disabled={disabled} onChange={(e) => answer(e.target.value)}>
              <option value="">Not answered</option>
              {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </Dropdown>
          </Field>
        );
        if (field.type === "LONG_TEXT") return <Field key={field.key} {...common} className="sm:col-span-2"><Textarea value={String(value ?? "")} disabled={disabled} rows={3} maxLength={2000} onChange={(e) => answer(e.target.value)} /></Field>;
        return <Field key={field.key} {...common}><Input type={INPUT_TYPES[field.type] ?? "text"} value={String(value ?? "")} disabled={disabled} onChange={(e) => answer(e.target.value)} /></Field>;
      })}
    </div>
  );
}
