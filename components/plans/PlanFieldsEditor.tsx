"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { savePlanFields } from "@/app/actions/plans";
import { Button, IconButton } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, EmptyState } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";

type FieldType = "TEXT" | "LONG_TEXT" | "SELECT" | "DATE" | "EMAIL" | "PHONE" | "NUMBER" | "CHECKBOX";
type QuestionValue = { key: string; label: string; helpText: string; type: FieldType; required: boolean; options: string[]; adminOnly: boolean };

const TYPES: Array<[FieldType, string]> = [
  ["TEXT", "Short answer"], ["LONG_TEXT", "Paragraph"], ["SELECT", "Choose one"], ["DATE", "Date"],
  ["EMAIL", "Email"], ["PHONE", "Phone"], ["NUMBER", "Number"], ["CHECKBOX", "Tick box"],
];

const keyFrom = (label: string, taken: string[]) => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "q_$1").slice(0, 32) || "question";
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base}_${n}`;
  return key;
};

/** The extra questions on this plan's join form, beyond name, email, phone and unit. */
export function PlanFieldsEditor({ slug, planId, initial, disabled }: { slug: string; planId: string; initial: QuestionValue[]; disabled: boolean }) {
  const router = useRouter();
  const [fields, setFields] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const update = (index: number, patch: Partial<QuestionValue>) => setFields((current) => current.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  const move = (index: number, by: number) => setFields((current) => {
    const next = [...current];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    return next;
  });

  return (
    <div className="flex flex-col gap-4">
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      {fields.length === 0 ? <EmptyState mood="sleepy">No extra questions. The form asks for name, email, phone and unit.</EmptyState> : null}
      <ol className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <li key={index} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <Field label={`Question ${index + 1}`}>
                <Input value={field.label} disabled={disabled} maxLength={120} onChange={(event) => update(index, { label: event.target.value, ...(initial.some((q) => q.key === field.key) ? {} : { key: keyFrom(event.target.value, fields.filter((_, i) => i !== index).map((q) => q.key)) }) })} />
              </Field>
              <Field label="Answer type">
                <Dropdown value={field.type} disabled={disabled} onChange={(event) => update(index, { type: event.target.value as FieldType })}>
                  {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Dropdown>
              </Field>
            </div>
            {field.type === "SELECT" ? (
              <Field label="Choices" helperText="Separate with commas.">
                <Input value={field.options.join(", ")} disabled={disabled} onChange={(event) => update(index, { options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) })} />
              </Field>
            ) : null}
            <Field label="Hint" optional>
              <Input value={field.helpText} disabled={disabled} maxLength={300} onChange={(event) => update(index, { helpText: event.target.value })} />
            </Field>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <CheckboxField checked={field.required} disabled={disabled} onCheckedChange={(checked) => update(index, { required: checked === true })} label="Required" />
              <CheckboxField checked={field.adminOnly} disabled={disabled} onCheckedChange={(checked) => update(index, { adminOnly: checked === true })} label="Managers only" description="Hidden from the public form." />
              {!disabled ? (
                <span className="ml-auto flex gap-1">
                  <IconButton label="Move up" size="sm" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp aria-hidden className="size-4" /></IconButton>
                  <IconButton label="Move down" size="sm" disabled={index === fields.length - 1} onClick={() => move(index, 1)}><ArrowDown aria-hidden className="size-4" /></IconButton>
                  <IconButton label={`Remove ${field.label || "question"}`} size="sm" variant="danger" onClick={() => setFields((current) => current.filter((_, i) => i !== index))}><Trash2 aria-hidden className="size-4" /></IconButton>
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {!disabled ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" disabled={fields.length >= 40} onClick={() => setFields((current) => [...current, { key: keyFrom("question", current.map((q) => q.key)), label: "", helpText: "", type: "TEXT", required: false, options: [], adminOnly: false }])}>
            <Plus aria-hidden className="size-4" />
            Add a question
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={pending}
            onClick={() => startTransition(async () => {
              const result = await savePlanFields({ organisationSlug: slug, planId, fields });
              setStatus(result.ok ? { ok: true, text: "Questions saved." } : { ok: false, text: result.error });
              if (result.ok) router.refresh();
            })}
          >
            Save questions
          </Button>
        </div>
      ) : null}
    </div>
  );
}
