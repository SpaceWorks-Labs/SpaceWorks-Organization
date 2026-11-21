"use client";

import { memo, useRef, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, SlidersHorizontal, Trash2 } from "lucide-react";
import { SECTION_LABELS, type PageSection } from "@/lib/publicPage/sections";
import { emptyReason, SectionBody, SELF_HEADED, type Live } from "@/components/public/sections/SectionBody";
import { EmptyNote, type ActionContext } from "@/components/public/sections/shared";
import { IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { sectionName } from "../sectionContent";
import styles from "./editor.module.css";

export type FrameAction = "up" | "down" | "duplicate" | "visibility" | "settings" | "remove";

/** One section as visitors see it (the public page's own heading and renderer), without the scroll reveal. */
export function SectionView({ section, live, context }: { section: PageSection; live: Live; context: ActionContext }) {
  const empty = emptyReason(section, live, context);
  const selfHeaded = SELF_HEADED.has(section.type);
  const showTitle = Boolean(section.title) && !selfHeaded;
  return (
    <section aria-label={section.title || SECTION_LABELS[section.type].label} className="flex flex-col gap-8">
      {showTitle ? <h2 className="max-w-[860px] text-display-m text-balance text-ink">{section.title}</h2> : null}
      {empty ? <EmptyNote>{empty}</EmptyNote> : <SectionBody section={section} live={live} context={context} />}
    </section>
  );
}

type Props = {
  section: PageSection;
  index: number;
  count: number;
  selected: boolean;
  failed: boolean;
  canDuplicate: boolean;
  canMove: boolean;
  dropEdge: "before" | "after" | null;
  /** The rendered content (the section, or the leading hero). */
  children: ReactNode;
  onSelect: (id: string, event: MouseEvent<HTMLElement> | null, content: HTMLElement | null) => void;
  onAction: (id: string, action: FrameAction) => void;
  onFocusSibling: (index: number, by: -1 | 1) => void;
  onDragStart: (index: number, event: DragEvent<HTMLElement>) => void;
  onDragOver: (index: number, event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

/**
 * A section on the canvas: an outline on hover and focus (solid when selected), and a toolbar to drag, move, duplicate,
 * hide or show, open its settings and delete. The content itself is inert (no links or focus inside); clicking it
 * selects the section and, on text, edits that text in place. With the keyboard: Tab to a section, Enter opens its
 * settings, Alt+Arrow keys move it, the arrow keys go to the next or previous section and Delete removes it.
 */
export const SectionFrame = memo(function SectionFrame({ section, index, count, selected, failed, canDuplicate, canMove, dropEdge, children, onSelect, onAction, onFocusSibling, ...drag }: Props) {
  const content = useRef<HTMLDivElement>(null);
  const name = sectionName(section);
  const label = SECTION_LABELS[section.type].label;
  const act = (action: FrameAction) => (event: MouseEvent) => {
    event.stopPropagation();
    onAction(section.id, action);
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onAction(section.id, "settings");
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      if (canMove) onAction(section.id, event.key === "ArrowUp" ? "up" : "down");
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      onFocusSibling(index, event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onAction(section.id, "remove");
    }
  };

  return (
    <div
      id={`frame-${section.id}`}
      data-frame-index={index}
      role="group"
      aria-roledescription="section"
      aria-label={`${name}, ${label}, ${index + 1} of ${count}${section.visible ? "" : ", hidden"}${failed ? ", needs attention" : ""}`}
      aria-keyshortcuts="Enter Alt+ArrowUp Alt+ArrowDown Delete"
      tabIndex={0}
      onClick={(event) => onSelect(section.id, event, content.current)}
      onFocus={(event) => { if (event.target === event.currentTarget) onSelect(section.id, null, null); }}
      onKeyDown={keys}
      onDragOver={(event) => drag.onDragOver(index, event)}
      onDrop={drag.onDrop}
      className={cn(
        "group/frame relative scroll-mt-24 rounded-xl outline-offset-[12px] focus-visible:outline-2 focus-visible:outline-primary",
        selected ? "outline-2 outline-solid outline-primary" : "hover:outline-2 hover:outline-dashed hover:outline-line-strong",
        failed && !selected && "outline-2 outline-solid outline-danger-fg",
        dropEdge === "before" && styles.dropBefore,
        dropEdge === "after" && styles.dropAfter,
      )}
    >
      <div ref={content} inert className={cn("transition-opacity duration-(--sw-dur-fast) ease-sw", !section.visible && "opacity-45")}>{children}</div>
      {!section.visible || failed ? (
        <div className="pointer-events-none absolute -top-3 left-0 flex gap-2">
          {!section.visible ? <Chip size="sm" tone="neutral">Hidden from visitors</Chip> : null}
          {failed ? <Chip size="sm" tone="danger">Needs attention</Chip> : null}
        </div>
      ) : null}
      <div
        role="toolbar"
        aria-label={`${name} tools`}
        data-shown={selected || undefined}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "absolute -top-16 right-0 z-10 flex items-center gap-2 rounded-control border border-line bg-panel py-1 pl-3 pr-1.5 shadow-float transition-opacity duration-(--sw-dur-fast) ease-sw",
          "pointer-events-none opacity-0 group-hover/frame:pointer-events-auto group-hover/frame:opacity-100 group-focus-within/frame:pointer-events-auto group-focus-within/frame:opacity-100 data-[shown]:pointer-events-auto data-[shown]:opacity-100",
        )}
      >
        <span className="hidden max-w-40 truncate text-caption font-semibold text-ink-muted @2xl:inline">{label}</span>
        {canMove ? (
          <span
            draggable
            onDragStart={(event) => drag.onDragStart(index, event)}
            onDragEnd={drag.onDragEnd}
            title="Drag to move. With the keyboard, use the move buttons or Alt and the arrow keys."
            className="hidden size-9 cursor-grab items-center justify-center rounded-full text-ink-muted hover:bg-muted hover:text-ink active:cursor-grabbing @xl:inline-flex"
          >
            <GripVertical aria-hidden className="size-[18px]" />
          </span>
        ) : null}
        <IconButton size="sm" label={`Move ${name} up`} disabled={!canMove || index === 0} onClick={act("up")}><ArrowUp /></IconButton>
        <IconButton size="sm" label={`Move ${name} down`} disabled={!canMove || index === count - 1} onClick={act("down")}><ArrowDown /></IconButton>
        <IconButton size="sm" label={`Duplicate ${name}`} disabled={!canDuplicate} onClick={act("duplicate")}><Copy /></IconButton>
        <IconButton size="sm" label={section.visible ? `Hide ${name}` : `Show ${name}`} onClick={act("visibility")}>{section.visible ? <Eye /> : <EyeOff />}</IconButton>
        <IconButton size="sm" label={`Settings for ${name}`} onClick={act("settings")}><SlidersHorizontal /></IconButton>
        <IconButton size="sm" variant="danger" label={`Delete ${name}`} onClick={act("remove")}><Trash2 /></IconButton>
      </div>
    </div>
  );
});
