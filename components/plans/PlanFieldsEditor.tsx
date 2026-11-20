"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { savePlanFields } from "@/app/actions/plans";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/display";
import { PlanQuestionCard } from "./PlanQuestionCard";
import { blankQuestion, keyFrom, type QuestionValue } from "./planQuestionState";

type Item = QuestionValue & { uid: number };
let nextUid = 0;
const withUid = (field: QuestionValue): Item => ({ ...field, uid: (nextUid += 1) });
const nameOf = (field: QuestionValue, index: number) => field.label.trim() || `${field.section ? "heading" : "question"} ${index + 1}`;
const rowId = (uid: number) => `plan-question-${uid}`;

/** The extra questions, section headings and conditions on this plan's join form. */
export function PlanFieldsEditor({ slug, planId, initial, conflicts, disabled, groupings }: { slug: string; planId: string; initial: QuestionValue[]; conflicts: string[]; disabled: boolean; groupings: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [fields, setFields] = useState(() => initial.map(withUid));
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const addRef = useRef<HTMLButtonElement>(null);
  // Where the keyboard goes once a move or removal has rendered.
  const focusAfter = useRef<{ uid: number; move?: "up" | "down" } | "add" | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    if (target === "add") return addRef.current?.focus();
    const row = document.getElementById(rowId(target.uid));
    const again = target.move ? row?.querySelector<HTMLButtonElement>(`[data-move="${target.move}"]`) : null;
    (again && !again.disabled ? again : row?.querySelector<HTMLElement>("[data-question-label]"))?.focus();
  }, [fields]);
  const update = (index: number, patch: Partial<QuestionValue>) => setFields((current) => {
    const oldKey = current[index].key;
    return current.map((field, i) => {
      if (i === index) return { ...field, ...patch };
      // A renamed key carries the conditions that follow it.
      return patch.key && patch.key !== oldKey && field.showIfKey === oldKey ? { ...field, showIfKey: patch.key } : field;
    });
  });
  const relabel = (index: number, label: string) => {
    const field = fields[index];
    const saved = initial.some((q) => q.key === field.key);
    update(index, { label, ...(saved ? {} : { key: keyFrom(label, fields.filter((_, i) => i !== index).map((q) => q.key)) }) });
  };
  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= fields.length) return;
    const next = [...fields];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    focusAfter.current = { uid: item.uid, move: by < 0 ? "up" : "down" };
    setFields(next);
    setAnnouncement(`Moved ${nameOf(item, index)} to position ${to + 1} of ${fields.length}.`);
  };
  const remove = (index: number) => {
    const neighbour = fields[index + 1] ?? fields[index - 1];
    focusAfter.current = neighbour ? { uid: neighbour.uid } : "add";
    setFields(fields.filter((_, i) => i !== index));
    setAnnouncement(`Removed ${nameOf(fields[index], index)}.`);
  };
  const labelled = (key: string) => {
    const field = fields.find((entry) => entry.key === key);
    return field?.label ? `${field.label} (${key})` : key;
  };

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
      {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
      {conflicts.length ? (
        <Callout tone="warning" title="Keys used differently across plans">
          {`${conflicts.map(labelled).join(", ")}. Public forms and member accounts skip these questions until every plan asks them the same way.`}
        </Callout>
      ) : null}
      {fields.length === 0 ? <EmptyState mood="sleepy">No extra questions. The form asks only for the details set in the join form settings.</EmptyState> : null}
      <ol className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <PlanQuestionCard
            rowId={rowId(field.uid)}
            name={nameOf(field, index)}
            groupings={groupings}
            key={field.uid}
            field={field}
            index={index}
            count={fields.length}
            earlier={fields.slice(0, index)}
            errors={errors}
            conflict={conflicts.includes(field.key)}
            disabled={disabled}
            onLabel={(label) => relabel(index, label)}
            onChange={(patch) => update(index, patch)}
            onMove={(by) => move(index, by)}
            onRemove={() => remove(index)}
          />
        ))}
      </ol>
      {!disabled ? (
        <div className="flex flex-wrap gap-3">
          <Button ref={addRef} type="button" variant="secondary" disabled={fields.length >= 40} onClick={() => setFields((current) => [...current, withUid(blankQuestion(current.map((q) => q.key)))])}>
            <Plus aria-hidden className="size-4" />
            Add a question
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={pending}
            onClick={() => startTransition(async () => {
              const result = await savePlanFields({ organisationSlug: slug, planId, fields /* the server drops each item's uid */ });
              setErrors(result.ok ? {} : result.fieldErrors ?? {});
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
