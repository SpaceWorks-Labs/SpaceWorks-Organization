"use client";

import { ArrowDown, ArrowUp, EyeOff } from "lucide-react";
import { SECTION_LABELS, type PageSection } from "@/lib/publicPage/sections";
import { IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { sectionName } from "../sectionContent";

/**
 * The page's sections as a list, top to bottom: open one's settings, or move it up or down. The keyboard and
 * single-pointer way to see and reorder the whole page (dragging on the canvas is never the only way).
 */
export function PageOutline({ sections, selectedId, failed, disabled, onOpen, onMove }: {
  sections: PageSection[];
  selectedId: string | null;
  failed: ReadonlySet<number>;
  disabled: boolean;
  onOpen: (id: string) => void;
  onMove: (from: number, to: number) => void;
}) {
  if (sections.length === 0) return <p className="text-body-ui text-ink-muted">No sections yet. Add a block, or start from a template.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {sections.map((section, index) => {
        const name = sectionName(section);
        return (
          <li key={section.id} className={cn("flex items-center gap-1 rounded-control border bg-panel p-1", selectedId === section.id ? "border-primary" : "border-line")}>
            <button
              type="button"
              aria-current={selectedId === section.id ? "true" : undefined}
              onClick={() => onOpen(section.id)}
              className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-control px-2 text-left hover:bg-muted"
            >
              <span className="truncate text-label font-semibold text-ink">{name}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
                {index + 1}. {SECTION_LABELS[section.type].label}
                {!section.visible ? <span className="inline-flex items-center gap-1"><EyeOff aria-hidden className="size-3.5" />Hidden</span> : null}
              </span>
            </button>
            {failed.has(index) ? <Chip size="sm" tone="danger">Needs attention</Chip> : null}
            <IconButton size="sm" label={`Move ${name} up`} disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp /></IconButton>
            <IconButton size="sm" label={`Move ${name} down`} disabled={disabled || index === sections.length - 1} onClick={() => onMove(index, index + 1)}><ArrowDown /></IconButton>
          </li>
        );
      })}
    </ol>
  );
}
