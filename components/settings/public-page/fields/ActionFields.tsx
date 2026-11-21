"use client";

import { isSafeLink, type ActionKind, type PageAction } from "@/lib/publicPage/sections";
import { Dropdown, Field, Input } from "@/components/ui/field";

const KIND_LABELS: Record<ActionKind, string> = {
  none: "No button",
  join: "Join a plan",
  plans: "Go to the plans",
  link: "Open a web link",
};

const DEFAULT_LABELS: Record<ActionKind, string> = { none: "", join: "Join now", plans: "See membership plans", link: "Find out more" };

/**
 * One button of a section: where it goes (a plan's join page, the plans section or a web link) and its label.
 * A join button whose plan isn't open goes to the plans section instead; the page never shows a dead button.
 */
export function ActionFields({ legend, value, plans, disabled, error, onChange }: {
  legend: string;
  value: PageAction;
  plans: Array<{ slug: string; name: string }>;
  disabled: boolean;
  /** The server's error for a path inside this button ("label", "url"). */
  error: (path: string) => string | undefined;
  onChange: (next: PageAction) => void;
}) {
  const setKind = (kind: ActionKind) => {
    const label = !value.label || value.label === DEFAULT_LABELS[value.kind] ? DEFAULT_LABELS[kind] : value.label;
    onChange({ ...value, kind, label, planSlug: kind === "join" ? value.planSlug || plans[0]?.slug || "" : "", url: kind === "link" ? value.url : "" });
  };
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4" disabled={disabled}>
      <legend className="px-1 text-label font-semibold text-ink">{legend}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Goes to">
          <Dropdown value={value.kind} onChange={(event) => setKind(event.target.value as ActionKind)}>
            {(Object.keys(KIND_LABELS) as ActionKind[]).map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
          </Dropdown>
        </Field>
        {value.kind !== "none" ? (
          <Field label="Button label" error={error("label")}>
            <Input value={value.label} maxLength={40} onChange={(event) => onChange({ ...value, label: event.target.value })} />
          </Field>
        ) : null}
      </div>
      {value.kind === "join" ? (
        plans.length ? (
          <Field label="Plan" helperText="If the plan stops taking members, the button goes to your plans instead." error={error("planSlug")}>
            <Dropdown value={value.planSlug} onChange={(event) => onChange({ ...value, planSlug: event.target.value })}>
              {plans.map((plan) => <option key={plan.slug} value={plan.slug}>{plan.name}</option>)}
            </Dropdown>
          </Field>
        ) : <p className="text-caption text-ink-muted">You have no plans yet, so this button goes to the plans section.</p>
      ) : null}
      {value.kind === "plans" ? <p className="text-caption text-ink-muted">Scrolls to your first visible plans section. Without one, the button isn&apos;t shown.</p> : null}
      {value.kind === "link" ? (
        <Field label="Web address" error={error("url") ?? (value.url && !isSafeLink(value.url) ? "Use a web address starting with https://, or mailto:" : undefined)}>
          <Input type="url" inputMode="url" value={value.url} maxLength={500} placeholder="https://" onChange={(event) => onChange({ ...value, url: event.target.value.trim() })} />
        </Field>
      ) : null}
    </fieldset>
  );
}
