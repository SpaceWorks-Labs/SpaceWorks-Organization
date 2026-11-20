"use client";

import { useId } from "react";
import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, FieldError } from "@/components/ui/field";

export type PickerGroupingView = {
  id: string;
  name: string;
  multiple: boolean;
  limited: boolean;
  values: Array<{ id: string; label: string }>;
};

/** One select (or one set of tick boxes) per grouping: a member's values, chosen by staff. */
export function GroupingPicker({ groupings, value, onChange, disabled, errors }: {
  groupings: PickerGroupingView[];
  value: Record<string, string[]>;
  onChange: (groupingId: string, valueIds: string[]) => void;
  disabled?: boolean;
  errors?: Record<string, string | undefined>;
}) {
  const baseId = useId();
  return (
    <>
      {groupings.map((grouping) => {
        const chosen = value[grouping.id] ?? [];
        const helper = grouping.limited ? "Only values inside your reach are offered." : undefined;
        if (grouping.multiple) {
          const error = errors?.[grouping.id];
          const helperId = helper ? `${baseId}-${grouping.id}-helper` : undefined;
          const errorId = error ? `${baseId}-${grouping.id}-error` : undefined;
          return (
            <fieldset key={grouping.id} className="flex flex-col gap-2.5" aria-invalid={error ? true : undefined} aria-describedby={[errorId, helperId].filter(Boolean).join(" ") || undefined}>
              <legend className="mb-2.5 text-label text-ink">{grouping.name}<span className="ml-1.5 font-normal text-ink-muted">{grouping.limited ? "Required" : "Optional"}</span></legend>
              {helper ? <p id={helperId} className="text-caption text-ink-muted">{helper}</p> : null}
              {grouping.values.map((entry) => (
                <CheckboxField
                  key={entry.id}
                  label={entry.label}
                  checked={chosen.includes(entry.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) => onChange(grouping.id, checked === true ? [...chosen, entry.id] : chosen.filter((id) => id !== entry.id))}
                />
              ))}
              {error ? <FieldError id={errorId}>{error}</FieldError> : null}
            </fieldset>
          );
        }
        return (
          <Field key={grouping.id} label={grouping.name} required={grouping.limited} optional={!grouping.limited} helperText={helper} error={errors?.[grouping.id]}>
            <Dropdown value={chosen[0] ?? ""} disabled={disabled} onChange={(event) => onChange(grouping.id, event.target.value ? [event.target.value] : [])}>
              <option value="">{grouping.limited ? "Choose one" : "None"}</option>
              {grouping.values.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </Dropdown>
          </Field>
        );
      })}
    </>
  );
}
