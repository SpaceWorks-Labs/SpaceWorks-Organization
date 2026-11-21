"use client";

import { SECTION_LABELS, type PageSection } from "@/lib/publicPage/sections";
import { SwitchRow } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { SectionFields } from "../SectionFields";
import type { FieldContext } from "../fields/shared";

/**
 * The selected section's full settings: its heading, whether visitors see it, and every field of its type (the same
 * editors for every block). Changes show on the canvas straight away and autosave as the draft.
 */
export function SectionSettings({ section, errors, onChange, ...context }: Omit<FieldContext, "error"> & {
  section: PageSection;
  /** The server's errors for this section, by path inside it. */
  errors: Record<string, string[]>;
  onChange: (next: PageSection, coalesce?: boolean) => void;
}) {
  const error = (path: string) => errors[path]?.[0];
  const count = Object.keys(errors).length;
  const self = section.type === "hero";
  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-ui text-ink-muted">{SECTION_LABELS[section.type].description}</p>
      {count ? <Callout tone="danger" role="alert">{count === 1 ? "One field here needs attention." : `${count} fields here need attention.`} The draft saves again once it&apos;s fixed.</Callout> : null}
      {!self ? (
        <Field label="Heading" optional helperText="Leave it empty for no heading. You can also click it on the page to edit it." error={error("title")}>
          <Input value={section.title} maxLength={80} disabled={context.disabled} onChange={(event) => onChange({ ...section, title: event.target.value }, true)} />
        </Field>
      ) : null}
      <SwitchRow
        label="Show on the page"
        description={section.visible ? "Visitors see this section once you publish." : "Hidden: it stays in your draft, visitors don't see it."}
        checked={section.visible}
        disabled={context.disabled}
        onCheckedChange={(visible) => onChange({ ...section, visible })}
      />
      <SectionFields {...context} section={section} error={error} onChange={(next) => onChange(next, true)} />
    </div>
  );
}
