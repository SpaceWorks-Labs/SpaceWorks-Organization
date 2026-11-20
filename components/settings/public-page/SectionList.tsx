"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Plus } from "lucide-react";
import { duplicateSection } from "@/lib/publicPage/defaults";
import { MAX_SECTIONS, newSection, type PageSection, type SectionType } from "@/lib/publicPage/sections";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { AddSectionDialog } from "./AddSectionDialog";
import { SectionRow } from "./SectionRow";
import { moveTo, sectionHasContent, sectionName } from "./sectionContent";

type Drag = { from: number; to: number } | null;

/** The server's errors for one section, keyed by the path inside it. */
function errorsFor(errors: Record<string, string[]>, index: number) {
  const prefix = `sections.${index}.`;
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
}

/**
 * The page's sections in order: open one to edit it, show or hide, reorder (drag the grip, the move buttons, or
 * Alt+Arrow keys on a section's name), duplicate, remove and add. Each move is announced once.
 */
export function SectionList({ slug, sections, plans, disabled, errors, contact, onChange }: {
  slug: string;
  sections: PageSection[];
  plans: Array<{ slug: string; name: string }>;
  disabled: boolean;
  errors: Record<string, string[]>;
  contact: { contactEmail: string | null; contactPhone: string | null };
  onChange: (sections: PageSection[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(sections[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [announcement, setAnnouncement] = useState("");
  // `label` is the move button that was pressed: it keeps focus while it can still move the section.
  const focusAfter = useRef<{ id: string; scroll: boolean; label?: string } | "add" | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const full = sections.length >= MAX_SECTIONS;
  const hasHero = sections.some((section) => section.type === "hero");

  // After a move, add or duplicate, keep the keyboard on the section (and bring a new one into view).
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    if (target === "add") return addRef.current?.focus();
    const again = target.label ? document.getElementById(`row-${target.id}`)?.querySelector<HTMLButtonElement>(`button[aria-label="${CSS.escape(target.label)}"]`) : null;
    const header = again && !again.disabled ? again : document.getElementById(`toggle-${target.id}`);
    header?.focus({ preventScroll: !target.scroll });
    if (target.scroll) {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(`row-${target.id}`)?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    }
  }, [sections, open]);

  const update = (index: number, next: PageSection) => onChange(sections.map((section, i) => (i === index ? next : section)));
  const moveSection = (from: number, to: number) => {
    const next = moveTo(sections, from, to);
    if (next === sections) return;
    const moved = sections[from]!;
    const active = document.activeElement;
    const pressed = active instanceof HTMLButtonElement && active.closest(`#row-${CSS.escape(moved.id)}`) ? active.getAttribute("aria-label") ?? undefined : undefined;
    focusAfter.current = { id: moved.id, scroll: false, label: pressed?.startsWith("Move ") ? pressed : undefined };
    onChange(next);
    setAnnouncement(`${sectionName(moved)} moved to position ${to + 1} of ${sections.length}.`);
  };
  const add = (type: SectionType) => {
    const section = newSection(type, undefined, contact);
    setAdding(false);
    onChange([...sections, section]);
    setOpen(section.id);
    focusAfter.current = { id: section.id, scroll: true };
    setAnnouncement(`${sectionName(section)} added at the end.`);
  };
  const duplicate = (index: number) => {
    const copy = duplicateSection(sections[index]!);
    onChange([...sections.slice(0, index + 1), copy, ...sections.slice(index + 1)]);
    setOpen(copy.id);
    focusAfter.current = { id: copy.id, scroll: true };
    setAnnouncement(`${sectionName(copy)} duplicated below.`);
  };
  const remove = (id: string) => {
    const index = sections.findIndex((one) => one.id === id);
    const section = sections[index];
    setRemoving(null);
    if (!section) return;
    // The keyboard moves to the next section, else the one before, else the add button.
    const neighbour = sections[index + 1] ?? sections[index - 1];
    focusAfter.current = neighbour ? { id: neighbour.id, scroll: false } : "add";
    onChange(sections.filter((one) => one.id !== id));
    setAnnouncement(`${sectionName(section)} removed.`);
  };
  const askRemove = (section: PageSection) => (sectionHasContent(section) ? setRemoving(section.id) : remove(section.id));

  // Native drag and drop: the grip starts it, each row says whether the drop lands above or below it.
  const dragStart = (index: number) => (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", sections[index]!.id);
    const row = document.getElementById(`row-${sections[index]!.id}`);
    if (row) event.dataTransfer.setDragImage(row, 24, 24);
    setDrag({ from: index, to: index });
  };
  const dragOver = (index: number) => (event: DragEvent<HTMLLIElement>) => {
    if (!drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const box = event.currentTarget.getBoundingClientRect();
    const to = event.clientY < box.top + box.height / 2 ? index : index + 1;
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const drop = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    if (!drag) return;
    const target = drag.to > drag.from ? drag.to - 1 : drag.to;
    setDrag(null);
    moveSection(drag.from, target);
  };
  const dropEdge = (index: number) => {
    if (!drag || drag.to === drag.from || drag.to === drag.from + 1) return null;
    if (drag.to === index) return "before" as const;
    return drag.to === sections.length && index === sections.length - 1 ? "after" as const : null;
  };

  const removingSection = sections.find((section) => section.id === removing);
  return (
    <div className="flex flex-col gap-3">
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
      {sections.length === 0 ? <p className="text-body-ui text-ink-muted">No sections yet. Add one, or start from a template.</p> : null}
      <ol className="flex flex-col gap-3">
        {sections.map((section, index) => (
          <SectionRow
            key={section.id}
            section={section}
            index={index}
            count={sections.length}
            expanded={open === section.id}
            canDuplicate={!full && section.type !== "hero"}
            errors={errorsFor(errors, index)}
            dropEdge={dropEdge(index)}
            dragging={drag?.from === index}
            disabled={disabled}
            slug={slug}
            plans={plans}
            onToggle={() => setOpen(open === section.id ? null : section.id)}
            onChange={(next) => update(index, next)}
            onMove={(by) => moveSection(index, index + by)}
            onDuplicate={() => duplicate(index)}
            onRemove={() => askRemove(section)}
            onDragStart={dragStart(index)}
            onDragOver={dragOver(index)}
            onDrop={drop}
            onDragEnd={() => setDrag(null)}
          />
        ))}
      </ol>
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong p-3">
          <Button ref={addRef} type="button" variant="secondary" disabled={full} onClick={() => setAdding(true)}><Plus aria-hidden className="size-4" />Add a section</Button>
          <p className="text-caption text-ink-muted">{full ? `A page holds up to ${MAX_SECTIONS} sections. Remove one to add another.` : "Drag a section by its grip to move it, or use the arrows."}</p>
        </div>
      ) : null}
      <AddSectionDialog open={adding} hasHero={hasHero} onOpenChange={setAdding} onAdd={add} />
      <ConfirmDialog
        open={Boolean(removingSection)}
        title={`Remove ${removingSection ? sectionName(removingSection) : "this section"}?`}
        message="What you wrote or uploaded in it goes from your draft. Visitors see no change until you publish."
        confirmLabel="Remove section"
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove(removing)}
      />
    </div>
  );
}
