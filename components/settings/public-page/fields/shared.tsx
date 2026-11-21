"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import type { AreaEntry, LiveStatResult } from "@/lib/publicPage/blockData";
import { pageImageUrl, type PageSection, type SectionOf } from "@/lib/publicPage/sections";
import { Button, IconButton } from "@/components/ui/button";
import { RadioCard, RadioGroup } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { ImageUploadButton } from "../ImageUploadButton";

/** What the newer blocks' editors read beside the document (from the editor loader). */
export type EditorExtras = {
  /** Every active area, in tree order (areas directory scope). */
  areas: AreaEntry[];
  /** The organisation's groupings, for "members by grouping". */
  groupings: Array<{ id: string; name: string }>;
  /** Every live numbers metric, organisation-wide (pick a block's with `statsForSection`). */
  statsCatalogue: LiveStatResult[];
  /** The organisation's names for its unit levels ("Area", "Unit"). */
  unitLevels: string[];
  /** Keys of the organisation's uploaded page images, newest first, for image pickers. */
  pageImages: string[];
};

/** What every section editor gets: the organisation, its plans for join buttons, and the server's errors. */
export type FieldContext = {
  slug: string;
  plans: Array<{ slug: string; name: string }>;
  disabled: boolean;
  /** The server's first error for a path inside this section ("primary.label", "people.2.name"). */
  error: (path: string) => string | undefined;
  extras: EditorExtras;
};

export type SectionProps<T extends PageSection["type"]> = FieldContext & { section: SectionOf<T>; onChange: (next: SectionOf<T>) => void };

/** Move one item of a list by one place; the caller keeps the result. */
export function moveItem<T>(items: T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * A repeatable list (people, quotes, milestones): each item in its own box with move up, move down and remove,
 * and an Add button that stops at the limit and says why. After a move, focus follows the item and its new place is
 * announced; after a removal, focus goes to the next item (or the Add button).
 */
export function ItemList<T>({ items, max, noun, addLabel, empty, disabled, create, onChange, children }: {
  items: T[];
  max: number;
  /** Singular, lower case: "person", "quote". */
  noun: string;
  addLabel: string;
  empty: string;
  disabled: boolean;
  create: () => T;
  onChange: (items: T[]) => void;
  children: (item: T, index: number, set: (patch: Partial<T>) => void) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const set = (index: number) => (patch: Partial<T>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const full = items.length >= max;
  const focusLater = (selector: string, fallback: string) => requestAnimationFrame(() => {
    const target = root.current?.querySelector<HTMLElement>(`${selector}:not(:disabled)`) ?? root.current?.querySelector<HTMLElement>(fallback);
    target?.focus();
  });
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    onChange(moveItem(items, index, by));
    setAnnouncement(`${noun[0]!.toUpperCase()}${noun.slice(1)} ${index + 1} is now ${noun} ${to + 1} of ${items.length}.`);
    focusLater(`[data-item="${to}"] [data-move="${by}"]`, `[data-item="${to}"] [data-move="${-by}"]`);
  };
  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
    setAnnouncement(`${noun[0]!.toUpperCase()}${noun.slice(1)} ${index + 1} removed.`);
    const next = Math.min(index, items.length - 2);
    focusLater(next >= 0 ? `[data-item="${next}"] [data-remove]` : "[data-add]", "[data-add]");
  };
  return (
    <div ref={root} className="flex flex-col gap-4">
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {items.length === 0 ? <p className="text-body-ui text-ink-muted">{empty}</p> : null}
      {items.map((item, index) => {
        const name = `${noun} ${index + 1}`;
        return (
          <div key={index} data-item={index} className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <div className="flex items-center gap-1">
              <p className="flex-1 text-label font-semibold text-ink first-letter:uppercase">{name}</p>
              <IconButton label={`Move ${name} up`} data-move={-1} variant="quiet" disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp /></IconButton>
              <IconButton label={`Move ${name} down`} data-move={1} variant="quiet" disabled={disabled || index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown /></IconButton>
              <IconButton label={`Remove ${name}`} data-remove variant="danger" disabled={disabled} onClick={() => remove(index)}><Trash2 /></IconButton>
            </div>
            {children(item, index, set(index))}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" data-add disabled={disabled || full} onClick={() => onChange([...items, create()])}><Plus aria-hidden className="size-4" />{addLabel}</Button>
        {full ? <p className="text-caption text-ink-muted">This section holds up to {max}. Remove one to add another.</p> : null}
      </div>
    </div>
  );
}

/** One uploaded page image: a preview, its description for screen readers, replace and remove. */
export function ImageField({ slug, label, imageKey, alt, aspect = "aspect-[4/3]", disabled, error, onChange }: {
  slug: string;
  label: string;
  imageKey: string | null;
  alt?: string;
  aspect?: string;
  disabled: boolean;
  error?: string;
  onChange: (next: { imageKey: string | null; alt?: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-label text-ink">{label}<span className="ml-1.5 font-normal text-ink-muted">Optional</span></p>
      {imageKey ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded through the app's own storage route
        <img src={pageImageUrl(imageKey)} alt="" className={cn("w-full max-w-[420px] rounded-xl border border-line object-cover", aspect)} />
      ) : <p className="text-body-ui text-ink-muted">No image yet.</p>}
      {error ? <p className="text-caption text-danger-fg">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <ImageUploadButton slug={slug} label={imageKey ? "Replace image" : "Upload an image"} disabled={disabled} onUploaded={(key) => onChange({ imageKey: key })} />
        {imageKey ? <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange({ imageKey: null, alt: "" })}><X aria-hidden className="size-4" />Remove image</Button> : null}
      </div>
      {imageKey && alt !== undefined ? (
        <Field label="Describe the image" optional helperText="For people using screen readers. Leave it empty if the image is only decoration.">
          <Input value={alt} maxLength={160} disabled={disabled} onChange={(event) => onChange({ imageKey, alt: event.target.value })} />
        </Field>
      ) : null}
    </div>
  );
}

/** A small set of named choices as cards (layouts, tones, sides). Each card is at least 56px tall. */
export function ChoiceCards<T extends string>({ label, value, options, disabled, onChange }: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; description?: string }>;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-label text-ink">{label}</p>
      <RadioGroup aria-label={label} value={value} disabled={disabled} onValueChange={(next) => onChange(next as T)} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((option) => <RadioCard key={option.value} value={option.value} label={option.label} description={option.description} />)}
      </RadioGroup>
    </div>
  );
}
