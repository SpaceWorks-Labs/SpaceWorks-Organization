"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { canLeadTo, hasChoices, KINDS, kindOf, kindPatch, type QuestionKind, type QuestionValue } from "./planQuestionState";

type Props = {
  field: QuestionValue;
  index: number;
  count: number;
  earlier: QuestionValue[];
  errors: Record<string, string[] | undefined>;
  conflict: boolean;
  disabled: boolean;
  onLabel: (label: string) => void;
  onChange: (patch: Partial<QuestionValue>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
};

/** Choices are typed separated by commas and kept as a list; the text stays as typed while editing. */
function ChoicesInput({ options, disabled, error, onChange }: { options: string[]; disabled: boolean; error?: string; onChange: (options: string[]) => void }) {
  const [text, setText] = useState(options.join(", "));
  return (
    <Field label="Choices" helperText="Separate with commas." error={error}>
      <Input value={text} disabled={disabled} onChange={(event) => { setText(event.target.value); onChange(event.target.value.split(",").map((option) => option.trim()).filter(Boolean)); }} />
    </Field>
  );
}

/** One question, section heading or condition on the plan's join form. */
export function PlanQuestionCard({ field, index, count, earlier, errors, conflict, disabled, onLabel, onChange, onMove, onRemove }: Props) {
  const error = (name: string) => errors[`fields.${index}.${name}`]?.[0];
  const parents = earlier.filter(canLeadTo);
  const parent = parents.find((entry) => entry.key === field.showIfKey);
  const semicolon = field.multiple && field.options.some((option) => option.includes(";")) ? "Choices cannot contain semicolons" : undefined;
  return (
    <li className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label={field.section ? `Heading ${index + 1}` : `Question ${index + 1}`} error={error("label") ?? error("key") ?? (conflict ? "Another plan uses this key differently" : undefined)}>
          <Input value={field.label} disabled={disabled} maxLength={120} onChange={(event) => onLabel(event.target.value)} />
        </Field>
        <Field label="Answer type" error={error("section") ?? error("multiple")}>
          <Dropdown value={kindOf(field)} disabled={disabled} onChange={(event) => onChange(kindPatch(event.target.value as QuestionKind))}>
            {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Dropdown>
        </Field>
      </div>
      {hasChoices(field) ? <ChoicesInput options={field.options} disabled={disabled} error={semicolon ?? error("options")} onChange={(options) => onChange({ options })} /> : null}
      <Field label={field.section ? "Text under the heading" : "Hint"} optional>
        <Input value={field.helpText} disabled={disabled} maxLength={300} onChange={(event) => onChange({ helpText: event.target.value })} />
      </Field>
      {!field.section && (parents.length > 0 || field.showIfKey) ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Show only when" error={error("showIfKey")}>
            <Dropdown value={field.showIfKey ?? ""} disabled={disabled} onChange={(event) => onChange({ showIfKey: event.target.value || null, showIfValue: null })}>
              <option value="">Always show</option>
              {field.showIfKey && !parent ? <option value={field.showIfKey}>A question that isn&apos;t above this one</option> : null}
              {parents.map((entry) => <option key={entry.key} value={entry.key}>{entry.label || entry.key}</option>)}
            </Dropdown>
          </Field>
          {field.showIfKey ? (
            <Field label="Is answered" error={error("showIfValue")}>
              <Dropdown value={field.showIfValue ?? ""} disabled={disabled} onChange={(event) => onChange({ showIfValue: event.target.value || null })}>
                <option value="" disabled>Choose one</option>
                {parent?.type === "CHECKBOX" ? <option value="true">Ticked</option> : parent?.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </Dropdown>
            </Field>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {!field.section ? <CheckboxField checked={field.required} disabled={disabled} onCheckedChange={(checked) => onChange({ required: checked === true })} label="Required" /> : null}
        <CheckboxField checked={field.adminOnly} disabled={disabled} onCheckedChange={(checked) => onChange({ adminOnly: checked === true })} label="Managers only" description="Hidden from the public form." />
        {!disabled ? (
          <span className="ml-auto flex gap-1">
            <IconButton label="Move up" size="sm" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp aria-hidden className="size-4" /></IconButton>
            <IconButton label="Move down" size="sm" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown aria-hidden className="size-4" /></IconButton>
            <IconButton label={`Remove ${field.label || "question"}`} size="sm" variant="danger" onClick={onRemove}><Trash2 aria-hidden className="size-4" /></IconButton>
          </span>
        ) : null}
      </div>
    </li>
  );
}
