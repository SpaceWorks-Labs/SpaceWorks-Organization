"use client";

import type { DragEvent, KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Copy, GripVertical, Trash2 } from "lucide-react";
import { SECTION_LABELS, type PageSection } from "@/lib/publicPage/sections";
import { IconButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/choice";
import { Chip } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { SectionFields } from "./SectionFields";
import { sectionName } from "./sectionContent";
import type { FieldContext } from "./fields/shared";

type Props = Omit<FieldContext, "error"> & {
  section: PageSection;
  index: number;
  count: number;
  expanded: boolean;
  canDuplicate: boolean;
  /** Errors from the server for this section, by path inside it. */
  errors: Record<string, string[]>;
  /** Where a dragged section would land: above or below this row. */
  dropEdge: "before" | "after" | null;
  dragging: boolean;
  onToggle: () => void;
  onChange: (next: PageSection) => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
};

/**
 * One section of the page: a header (open or close, show or hide, drag, move, duplicate, remove) and, when open,
 * its fields. Alt+Arrow keys on the header move the section, the keyboard path for dragging.
 */
export function SectionRow({ section, index, count, expanded, canDuplicate, errors, dropEdge, dragging, disabled, slug, plans, onToggle, onChange, onMove, onDuplicate, onRemove, ...drag }: Props) {
  const name = sectionName(section);
  const label = SECTION_LABELS[section.type].label;
  const failed = Object.keys(errors).length > 0;
  const error = (path: string) => errors[path]?.[0];
  const keys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || disabled || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    onMove(event.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <li
      id={`row-${section.id}`}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      className={cn(
        "relative rounded-xl border bg-panel transition-opacity duration-(--sw-dur-fast) ease-sw",
        failed ? "border-danger-fg" : "border-line",
        dragging && "opacity-60",
        dropEdge === "before" && "before:absolute before:inset-x-0 before:-top-2 before:h-0.5 before:rounded-full before:bg-accent",
        dropEdge === "after" && "after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:rounded-full after:bg-accent",
      )}
    >
      <div className="flex flex-wrap items-center gap-1 p-2 sm:flex-nowrap">
        {!disabled ? (
          <span
            draggable
            onDragStart={drag.onDragStart}
            onDragEnd={drag.onDragEnd}
            title="Drag to move. With the keyboard, use Alt and the arrow keys on the section name."
            className="hidden size-11 shrink-0 cursor-grab items-center justify-center rounded-full text-ink-muted hover:bg-muted hover:text-ink active:cursor-grabbing sm:inline-flex"
          >
            <GripVertical aria-hidden className="size-5" />
          </span>
        ) : null}
        <button
          type="button"
          id={`toggle-${section.id}`}
          aria-expanded={expanded}
          aria-controls={`edit-${section.id}`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          onClick={onToggle}
          onKeyDown={keys}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control px-2 text-left hover:bg-muted"
        >
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-muted transition-transform duration-(--sw-dur-base) ease-sw motion-reduce:transition-none", expanded && "rotate-180")} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-label font-semibold text-ink">{name}</span>
            <span className="block text-caption text-ink-muted">{index + 1} of {count} · {label}{section.visible ? "" : " · hidden"}</span>
          </span>
          {failed ? <Chip size="sm" tone="danger">Needs attention</Chip> : null}
        </button>
        <div className="flex items-center gap-1">
          <Switch aria-label={`Show ${name}`} checked={section.visible} disabled={disabled} onCheckedChange={(visible) => onChange({ ...section, visible })} className="mx-1" />
          <IconButton label={`Move ${name} up`} variant="quiet" disabled={disabled || index === 0} onClick={() => onMove(-1)}><ArrowUp /></IconButton>
          <IconButton label={`Move ${name} down`} variant="quiet" disabled={disabled || index === count - 1} onClick={() => onMove(1)}><ArrowDown /></IconButton>
          <IconButton label={`Duplicate ${name}`} variant="quiet" disabled={disabled || !canDuplicate} onClick={onDuplicate}><Copy /></IconButton>
          <IconButton label={`Remove ${name}`} variant="danger" disabled={disabled} onClick={onRemove}><Trash2 /></IconButton>
        </div>
      </div>
      {expanded ? (
        <div id={`edit-${section.id}`} className="flex flex-col gap-4 border-t border-line p-4">
          <Field label="Heading" optional helperText="Leave it empty for no heading." error={error("title")}>
            <Input value={section.title} maxLength={80} disabled={disabled} onChange={(event) => onChange({ ...section, title: event.target.value })} />
          </Field>
          <SectionFields slug={slug} plans={plans} section={section} disabled={disabled} error={error} onChange={onChange} />
        </div>
      ) : null}
    </li>
  );
}
