"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { MAX_SECTIONS, newSection, SECTION_LABELS, SECTION_TYPES, type PageSection, type SectionType } from "@/lib/publicPage/sections";
import { Button, IconButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/choice";
import { Chip } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { SectionFields } from "./SectionFields";

/** The page's sections in order: show or hide, reorder, edit and remove each one, and add more. */
export function SectionList({ slug, sections, disabled, errors, contact, onChange }: {
  slug: string;
  sections: PageSection[];
  disabled: boolean;
  errors: Record<string, string[]>;
  contact: { contactEmail: string | null; contactPhone: string | null };
  onChange: (sections: PageSection[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(sections[0]?.id ?? null);
  const [adding, setAdding] = useState<SectionType>("about");
  const update = (index: number, next: PageSection) => onChange(sections.map((section, i) => (i === index ? next : section)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...sections];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  const add = () => {
    const section = newSection(adding, undefined, contact);
    onChange([...sections, section]);
    setOpen(section.id);
  };

  return (
    <div className="flex flex-col gap-3">
      {sections.length === 0 ? <p className="text-body-ui text-ink-muted">No sections yet. Add one below.</p> : null}
      <ol className="flex flex-col gap-3">
        {sections.map((section, index) => {
          const expanded = open === section.id;
          const prefix = `sections.${index}.`;
          const sectionErrors = Object.keys(errors).filter((key) => key.startsWith(prefix));
          const error = (path: string) => errors[`${prefix}${path}`]?.[0];
          const label = SECTION_LABELS[section.type].label;
          return (
            <li key={section.id} className={cn("rounded-xl border bg-panel", sectionErrors.length ? "border-danger-fg" : "border-line")}>
              <div className="flex flex-wrap items-center gap-2 p-3 sm:flex-nowrap">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`edit-${section.id}`}
                  onClick={() => setOpen(expanded ? null : section.id)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control px-2 text-left hover:bg-muted"
                >
                  <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-muted transition-transform duration-(--sw-dur-base) ease-sw motion-reduce:transition-none", expanded && "rotate-180")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label font-semibold text-ink">{section.title || label}</span>
                    <span className="block text-caption text-ink-muted">{label}{section.visible ? "" : " · hidden"}</span>
                  </span>
                  {sectionErrors.length ? <Chip size="sm" tone="danger">Needs attention</Chip> : null}
                </button>
                <div className="flex items-center gap-1">
                  <Switch aria-label={`Show ${section.title || label}`} checked={section.visible} disabled={disabled} onCheckedChange={(visible) => update(index, { ...section, visible })} />
                  <IconButton label={`Move ${section.title || label} up`} variant="quiet" disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp /></IconButton>
                  <IconButton label={`Move ${section.title || label} down`} variant="quiet" disabled={disabled || index === sections.length - 1} onClick={() => move(index, 1)}><ArrowDown /></IconButton>
                  <IconButton label={`Remove ${section.title || label}`} variant="danger" disabled={disabled} onClick={() => onChange(sections.filter((_, i) => i !== index))}><Trash2 /></IconButton>
                </div>
              </div>
              {expanded ? (
                <div id={`edit-${section.id}`} className="flex flex-col gap-4 border-t border-line p-4">
                  <Field label="Heading" optional helperText="Leave it empty for no heading." error={error("title")}>
                    <Input value={section.title} maxLength={80} disabled={disabled} onChange={(event) => update(index, { ...section, title: event.target.value })} />
                  </Field>
                  <SectionFields slug={slug} section={section} disabled={disabled} error={error} onChange={(next) => update(index, next)} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {!disabled ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line-strong p-3">
          <Field label="Add a section" className="min-w-[220px] flex-1" helperText={SECTION_LABELS[adding].description}>
            <Dropdown value={adding} onChange={(event) => setAdding(event.target.value as SectionType)}>
              {SECTION_TYPES.map((type) => <option key={type} value={type}>{SECTION_LABELS[type].label}</option>)}
            </Dropdown>
          </Field>
          <Button type="button" variant="secondary" className="mb-6" disabled={sections.length >= MAX_SECTIONS} onClick={add}><Plus aria-hidden className="size-4" />Add section</Button>
        </div>
      ) : null}
    </div>
  );
}
