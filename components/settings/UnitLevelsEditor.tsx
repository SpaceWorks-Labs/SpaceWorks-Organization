"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { setUnitLevels } from "@/app/actions/units";
import { UNIT_LEVEL_TEMPLATES } from "@/lib/structure/units";
import { Button, IconButton } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";

const SUGGESTED = ["Region", "District", "Chapter", "Branch"];

/** Name the levels of the unit tree, top first. Up to four levels; none means no units. */
export function UnitLevelsEditor({ slug, initial, disabled }: { slug: string; initial: string[]; disabled: boolean }) {
  const router = useRouter();
  const [levels, setLevels] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed = JSON.stringify(levels) !== JSON.stringify(initial);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await setUnitLevels({ organisationSlug: slug, levels: levels.map((level) => level.trim()).filter(Boolean) });
          if (!result.ok) setError(result.error);
          else {
            setSaved(true);
            router.refresh();
          }
        });
      }}
    >
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {saved ? <Callout tone="success" role="status">Levels saved.</Callout> : null}
      {levels.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-ui text-ink-secondary">No levels yet. Start from a template or add your own, then save.</p>
          {!disabled ? (
            <div className="flex flex-wrap gap-2">
              {UNIT_LEVEL_TEMPLATES.map((template) => (
                <Button key={template.label} type="button" size="sm" variant="secondary" onClick={() => setLevels(template.levels)}>{template.label}</Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {levels.map((level, index) => (
            <li key={index} className="flex items-end gap-2">
              <Field label={`Level ${index + 1}${index === 0 ? " (top)" : ""}`} className="flex-1">
                <Input value={level} maxLength={40} disabled={disabled} onChange={(event) => setLevels((current) => current.map((value, i) => (i === index ? event.target.value : value)))} />
              </Field>
              {index === levels.length - 1 && !disabled ? (
                <IconButton label={`Remove ${level || "this level"}`} variant="quiet" onClick={() => setLevels((current) => current.slice(0, -1))}>
                  <X aria-hidden className="size-4" />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-3">
          {levels.length < 4 ? (
            <Button type="button" variant="secondary" onClick={() => setLevels((current) => [...current, SUGGESTED[current.length] ?? ""])}>
              <Plus aria-hidden className="size-4" />
              Add a level
            </Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={!changed} loading={pending}>Save levels</Button>
        </div>
      ) : null}
    </form>
  );
}
