"use client";

import type { ReactNode } from "react";
import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, FieldError, Input, Textarea } from "@/components/ui/field";
import { profileQuestions, type ProfileItem, type QuestionField } from "@/lib/membership/profileQuestions";

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
  const groupingQuestions = questions.filter((question) => question.type === "GROUPING" && question.groupingValues);
  return (
    <>
      {renderItems(items, answers, onAnswer, errors)}
      {groupingQuestions.map((question) => <GroupingQuestion key={question.key} question={question} value={answers[question.key]} onAnswer={(next) => onAnswer(question.key, next)} error={errors[`fieldValues.${question.key}`]?.[0]} />)}
    </>
  );
}

/** A grouping question: one value from a select (indented for a tree), or several from checkboxes. */
function GroupingQuestion({ question, value, onAnswer, error }: { question: QuestionField; value: JoinAnswer | undefined; onAnswer: (value: JoinAnswer) => void; error?: string }) {
  const values = question.groupingValues ?? [];
  if (question.groupingMultiple) {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <ChoiceGroup id={`join-${question.key}`} label={question.label} required={question.required} helpText={question.helpText} error={error}>
        {values.map((entry) => (
          <CheckboxField key={entry.id} label={entry.label} checked={chosen.includes(entry.id)} onCheckedChange={(checked) => onAnswer(checked === true ? [...chosen, entry.id] : chosen.filter((id) => id !== entry.id))} />
        ))}
      </ChoiceGroup>
    );
  }
  return (
    <Field label={question.label} required={question.required} optional={!question.required} error={error} helperText={question.helpText || undefined}>
      <Dropdown value={typeof value === "string" ? value : ""} onChange={(event) => onAnswer(event.target.value)}>
        <option value="" disabled={question.required}>Choose one</option>
        {values.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </Dropdown>
    </Field>
  );
}

function renderItems(items: ProfileItem[], answers: Record<string, JoinAnswer>, onAnswer: (key: string, value: JoinAnswer) => void, errors: Record<string, string[] | undefined>) {
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
        <ChoiceGroup key={question.key} id={`join-${question.key}`} label={question.label} required={item.required} helpText={question.helpText} error={error}>
          {question.options.map((option) => (
            <CheckboxField
              key={option}
              label={option}
              checked={chosen.includes(option)}
              onCheckedChange={(checked) => setAnswer(checked === true ? [...chosen, option] : chosen.filter((entry) => entry !== option))}
            />
          ))}
        </ChoiceGroup>
      );
    }
    if (question.type === "CHECKBOX") {
      return (
        <CheckboxField key={question.key} checked={value === true} onCheckedChange={(checked) => setAnswer(checked === true)} label={question.label} description={question.helpText || undefined} error={error} />
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

/** Several checkboxes under one legend; the help text and any error describe the group, which is marked invalid. */
function ChoiceGroup({ id, label, required, helpText, error, children }: { id: string; label: string; required: boolean; helpText?: string; error?: string; children: ReactNode }) {
  const describedBy = [error ? `${id}-error` : null, helpText ? `${id}-help` : null].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset className="flex flex-col gap-2.5" aria-invalid={error ? true : undefined} aria-describedby={describedBy}>
      <legend className="mb-2.5 text-label text-ink">{label}{required ? null : <span className="ml-1.5 font-normal text-ink-muted">Optional</span>}</legend>
      {helpText ? <p id={`${id}-help`} className="text-caption text-ink-muted">{helpText}</p> : null}
      {children}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </fieldset>
  );
}
