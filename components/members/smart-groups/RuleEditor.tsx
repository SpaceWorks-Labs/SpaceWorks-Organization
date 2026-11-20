"use client";

import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { INDIAN_STATES } from "@/lib/indianStates";
import { OFFERED_RULES, RULE_LABELS, defaultRule } from "@/lib/groups/builderModel";
import { TERM_STATUSES, type Rule } from "@/lib/groups/schema";

export type BuilderOptions = {
  plans: Array<{ id: string; name: string }>;
  units: Array<{ id: string; name: string; level: number }>;
  groupings: Array<{ id: string; name: string; values: Array<{ id: string; label: string }> }>;
  fields: Array<{ key: string; label: string; type: string }>;
};

const STATUS_LABELS: Record<(typeof TERM_STATUSES)[number], string> = {
  PENDING_APPROVAL: "Waiting for approval", PENDING_PAYMENT: "Waiting for payment", UPCOMING: "Starts later", ACTIVE: "Active", GRACE: "In grace", ENDED: "Ended",
  LAPSED: "Lapsed", EXPIRED: "Expired", CANCELLED: "Cancelled", REJECTED: "Declined", REVOKED: "Revoked",
};

/** A scrollable set of tick boxes: pick several of a list. */
function Many<T extends string>({ label, items, chosen, onChange }: { label: string; items: Array<{ id: T; label: string }>; chosen: readonly T[]; onChange: (ids: T[]) => void }) {
  return (
    <fieldset className="flex max-h-44 flex-col gap-1.5 overflow-y-auto rounded-xl border border-line p-3">
      <legend className="px-1 text-label text-ink">{label}</legend>
      {items.length === 0 ? <p className="text-caption text-ink-muted">Nothing to choose from yet.</p> : null}
      {items.map((item) => (
        <CheckboxField key={item.id} label={item.label} checked={chosen.includes(item.id)} onCheckedChange={(checked) => onChange(checked === true ? [...chosen, item.id] : chosen.filter((id) => id !== item.id))} />
      ))}
    </fieldset>
  );
}

const indent = (level: number, text: string) => `${"— ".repeat(level)}${text}`;

/** One rule of a smart group: what it asks about, and its choices. */
export function RuleEditor({ rule, options, onChange }: { rule: Rule; options: BuilderOptions; onChange: (rule: Rule) => void }) {
  // The two answer rules share one entry in the type list, told apart by an operator.
  const shown = rule.type === "answerIn" ? "answer" : rule.type;
  const questions = options.fields;
  const keySelect = (value: string, set: (key: string) => void, only?: string) => (
    <Field label="Question">
      <Dropdown value={value} onChange={(event) => set(event.target.value)}>
        <option value="" disabled>Choose a question</option>
        {questions.filter((field) => !only || field.type === only).map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
      </Dropdown>
    </Field>
  );
  return (
    <div className="flex flex-col gap-3">
      <Field label="Condition">
        <Dropdown value={shown} onChange={(event) => onChange(defaultRule(event.target.value as Rule["type"]))}>
          {OFFERED_RULES.map((type) => <option key={type} value={type}>{RULE_LABELS[type]}</option>)}
        </Dropdown>
      </Field>
      {rule.type === "plan" ? <Many label="Plans" items={options.plans.map((plan) => ({ id: plan.id, label: plan.name }))} chosen={rule.planIds} onChange={(planIds) => onChange({ ...rule, planIds })} /> : null}
      {rule.type === "status" ? <Many label="Statuses" items={TERM_STATUSES.map((status) => ({ id: status, label: STATUS_LABELS[status] }))} chosen={rule.statuses} onChange={(statuses) => onChange({ ...rule, statuses })} /> : null}
      {rule.type === "unit" ? <Many label="Units (and everything under them)" items={options.units.map((unit) => ({ id: unit.id, label: indent(unit.level, unit.name) }))} chosen={rule.unitIds} onChange={(unitIds) => onChange({ ...rule, unitIds })} /> : null}
      {rule.type === "grouping" ? (
        <>
          <Field label="Grouping">
            <Dropdown value={rule.groupingId} onChange={(event) => onChange({ ...rule, groupingId: event.target.value, valueIds: [] })}>
              <option value="" disabled>Choose a grouping</option>
              {options.groupings.map((grouping) => <option key={grouping.id} value={grouping.id}>{grouping.name}</option>)}
            </Dropdown>
          </Field>
          {rule.groupingId ? <Many label="Values (a value covers those under it)" items={options.groupings.find((grouping) => grouping.id === rule.groupingId)?.values ?? []} chosen={rule.valueIds} onChange={(valueIds) => onChange({ ...rule, valueIds })} /> : null}
        </>
      ) : null}
      {rule.type === "answer" || rule.type === "answerIn" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {keySelect(rule.key, (key) => onChange({ ...rule, key }))}
          <Field label="Is">
            <Dropdown
              value={rule.type === "answerIn" ? "in" : rule.op}
              onChange={(event) => {
                const op = event.target.value;
                if (op === "in") onChange({ type: "answerIn", key: rule.key, values: rule.type === "answerIn" ? rule.values : [] });
                else onChange({ type: "answer", key: rule.key, op: op as "equals" | "contains", value: rule.type === "answer" ? rule.value : "" });
              }}
            >
              <option value="equals">Exactly</option>
              <option value="contains">Containing</option>
              <option value="in">One of</option>
            </Dropdown>
          </Field>
          {rule.type === "answerIn"
            ? <Field label="Answers" helperText="Separate with commas."><Input value={rule.values.join(", ")} onChange={(event) => onChange({ ...rule, values: event.target.value.split(",").map((part) => part.trim()).filter(Boolean) })} /></Field>
            : <Field label="Text"><Input value={rule.value} maxLength={200} onChange={(event) => onChange({ ...rule, value: event.target.value })} /></Field>}
        </div>
      ) : null}
      {rule.type === "joined" || rule.type === "renewed" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="When"><Dropdown value={rule.op} onChange={(event) => onChange({ ...rule, op: event.target.value as "before" | "after" })}><option value="before">Before</option><option value="after">After</option></Dropdown></Field>
          <Field label="Date"><Input type="date" value={rule.date} onChange={(event) => onChange({ ...rule, date: event.target.value })} /></Field>
        </div>
      ) : null}
      {rule.type === "endsWithin" ? <Field label="Days"><Input type="number" min={0} max={3650} value={rule.days} onChange={(event) => onChange({ ...rule, days: Math.max(0, Math.min(3650, Number(event.target.value) || 0)) })} /></Field> : null}
      {rule.type === "age" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {keySelect(rule.key, (key) => onChange({ ...rule, key }), "DATE")}
          <Field label="From age"><Input type="number" min={0} max={130} value={rule.min ?? ""} onChange={(event) => onChange({ ...rule, min: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>
          <Field label="To age"><Input type="number" min={0} max={130} value={rule.max ?? ""} onChange={(event) => onChange({ ...rule, max: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>
        </div>
      ) : null}
      {rule.type === "state" ? <Many label="States" items={INDIAN_STATES.map((state) => ({ id: state.code, label: state.name }))} chosen={rule.codes} onChange={(codes) => onChange({ ...rule, codes })} /> : null}
      {rule.type === "city" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {keySelect(rule.key, (key) => onChange({ ...rule, key }))}
          <Field label="City"><Input value={rule.value} maxLength={200} onChange={(event) => onChange({ ...rule, value: event.target.value })} /></Field>
        </div>
      ) : null}
    </div>
  );
}
