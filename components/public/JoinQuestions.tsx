"use client";

import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { profileQuestions, type QuestionField } from "@/lib/membership/profileQuestions";

export type JoinAnswer = string | boolean | string[];

/**
 * The plan's questions, under their section headings. Visibility and required markers come from the same helper
 * the server validates with, so a question shows only while its condition holds.
 */
export function JoinQuestions({ questions, answers, onAnswer, errors }: {
  questions: QuestionField[];
  answers: Record<string, JoinAnswer>;
  onAnswer: (key: string, value: JoinAnswer) => void;
  errors: Record<string, string[] | undefined>;
}) {
  const items = profileQuestions([{ id: "plan", fields: questions }], answers, false);
  return items.map((item) => {
    const question = item.field;
    if (item.kind === "section") {
      return (
        <div key={`section:${question.key}`} className="flex flex-col gap-1 border-t border-line pt-5">
          <h2 className="text-h3 text-ink">{question.label}</h2>
          {question.helpText ? <p className="text-body-ui text-ink-secondary">{question.helpText}</p> : null}
        </div>
      );
    }
    const error = errors[`fieldValues.${question.key}`]?.[0];
    const value = answers[question.key];
    const setAnswer = (next: JoinAnswer) => onAnswer(question.key, next);
    const common = { label: question.label, required: item.required, optional: !item.required, error, helperText: question.helpText || undefined };
    if (question.multiple) {
      const chosen = Array.isArray(value) ? value : [];
      return (
        <fieldset key={question.key} className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-label text-ink">{question.label}{item.required ? null : <span className="ml-1.5 font-normal text-ink-muted">Optional</span>}</legend>
          {question.helpText ? <p className="text-caption text-ink-muted">{question.helpText}</p> : null}
          {question.options.map((option) => (
            <CheckboxField
              key={option}
              label={option}
              checked={chosen.includes(option)}
              onCheckedChange={(checked) => setAnswer(checked === true ? [...chosen, option] : chosen.filter((entry) => entry !== option))}
            />
          ))}
          {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
        </fieldset>
      );
    }
    if (question.type === "CHECKBOX") {
      return (
        <div key={question.key} className="flex flex-col gap-1">
          <CheckboxField checked={value === true} onCheckedChange={(checked) => setAnswer(checked === true)} label={question.label} description={question.helpText || undefined} />
          {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
        </div>
      );
    }
    const text = typeof value === "string" ? value : "";
    if (question.type === "SELECT") {
      return (
        <Field key={question.key} {...common}>
          <Dropdown value={text} onChange={(event) => setAnswer(event.target.value)}>
            <option value="" disabled>Choose one</option>
            {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </Dropdown>
        </Field>
      );
    }
    if (question.type === "LONG_TEXT") return <Field key={question.key} {...common}><Textarea value={text} onChange={(event) => setAnswer(event.target.value)} rows={4} maxLength={2000} /></Field>;
    const type = { DATE: "date", NUMBER: "number", EMAIL: "email", PHONE: "tel" }[question.type] ?? "text";
    return <Field key={question.key} {...common}><Input type={type} value={text} onChange={(event) => setAnswer(event.target.value)} maxLength={300} /></Field>;
  });
}
