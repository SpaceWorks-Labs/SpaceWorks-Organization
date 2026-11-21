"use client";

import { useCallback, useState } from "react";
import { duplicateSection } from "@/lib/publicPage/defaults";
import { MAX_SECTIONS, newSection, type PageDocument, type PageSection, type SectionType } from "@/lib/publicPage/sections";
import { sectionHasContent, sectionName } from "../sectionContent";
import { insertSectionAfter, moveSectionTo, removeSection, replaceSection, setIn } from "./documentOps";
import { PAGE_TOP } from "./EditorCanvas";
import type { FrameAction } from "./SectionFrame";

type Change = (next: PageDocument | ((current: PageDocument) => PageDocument), coalesce?: boolean) => void;

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Bring a section's frame into view and put the keyboard on it (or on the named button inside it), after the redraw. */
function focusFrame(id: string, { scroll = false, button }: { scroll?: boolean; button?: string } = {}) {
  requestAnimationFrame(() => {
    const frame = document.getElementById(`frame-${id}`);
    if (!frame) return;
    if (scroll) frame.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
    const again = button ? frame.querySelector<HTMLButtonElement>(`button[aria-label="${CSS.escape(button)}"]`) : null;
    (again && !again.disabled ? again : frame).focus({ preventScroll: true });
  });
}

/**
 * What the canvas, the outline and the block library do to sections: move, duplicate, show or hide, delete (asking
 * first when it holds content), insert after the selected section, and edit a field in place. Every change is one undo
 * step and is announced once in the editor's polite status region.
 */
export function useSectionActions({ document: page, change, contact, selectedId, onSelect, onOpenSettings, announce }: {
  document: PageDocument;
  change: Change;
  contact: { contactEmail: string | null; contactPhone: string | null };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenSettings: (id: string) => void;
  announce: (message: string) => void;
}) {
  const [removing, setRemoving] = useState<PageSection | null>(null);
  const sections = page.sections;

  const move = useCallback((from: number, to: number) => {
    const section = sections[from];
    if (!section || to < 0 || to >= sections.length || from === to) return;
    const pressed = globalThis.document?.activeElement?.getAttribute("aria-label") ?? undefined;
    change((current) => moveSectionTo(current, from, to));
    announce(`${sectionName(section)} moved to position ${to + 1} of ${sections.length}.`);
    focusFrame(section.id, { button: pressed?.startsWith("Move ") ? pressed : undefined });
  }, [sections, change, announce]);

  const remove = useCallback((id: string) => {
    const index = sections.findIndex((one) => one.id === id);
    const section = sections[index];
    setRemoving(null);
    if (!section) return;
    const neighbour = sections[index + 1] ?? sections[index - 1];
    change((current) => removeSection(current, id));
    if (selectedId === id) onSelect(neighbour?.id ?? null);
    announce(`${sectionName(section)} deleted. Undo brings it back.`);
    if (neighbour) focusFrame(neighbour.id);
  }, [sections, change, selectedId, onSelect, announce]);

  const act = useCallback((id: string, action: FrameAction) => {
    const index = sections.findIndex((one) => one.id === id);
    const section = sections[index];
    if (!section) return;
    switch (action) {
      case "up": return move(index, index - 1);
      case "down": return move(index, index + 1);
      case "settings": return onOpenSettings(id);
      case "visibility": {
        change((current) => replaceSection(current, { ...section, visible: !section.visible }));
        return announce(`${sectionName(section)} ${section.visible ? "hidden from visitors" : "shown to visitors"}.`);
      }
      case "duplicate": {
        if (section.type === "hero" || sections.length >= MAX_SECTIONS) return;
        const copy = duplicateSection(section);
        change((current) => insertSectionAfter(current, copy, id));
        onSelect(copy.id);
        announce(`${sectionName(section)} duplicated below.`);
        return focusFrame(copy.id, { scroll: true });
      }
      case "remove": return sectionHasContent(section) ? setRemoving(section) : remove(id);
    }
  }, [sections, move, remove, change, onSelect, onOpenSettings, announce]);

  const insert = useCallback((type: SectionType) => {
    const section = newSection(type, undefined, contact);
    const after = selectedId && selectedId !== PAGE_TOP && sections.some((one) => one.id === selectedId) ? selectedId : null;
    change((current) => insertSectionAfter(current, section, after));
    onOpenSettings(section.id);
    const position = after ? sections.findIndex((one) => one.id === after) + 2 : sections.length + 1;
    announce(`${sectionName(section)} added at position ${position} of ${sections.length + 1}.`);
    focusFrame(section.id, { scroll: true });
  }, [contact, selectedId, sections, change, onOpenSettings, announce]);

  /** An in-place edit: a section field, or the page's own tagline (PAGE_TOP). Typing coalesces into one undo step. */
  const editField = useCallback((sectionId: string, path: string, value: string) => {
    change((current) => {
      if (sectionId === PAGE_TOP) return setIn(current, path, value);
      const section = current.sections.find((one) => one.id === sectionId);
      return section ? replaceSection(current, setIn(section, path, value)) : current;
    }, true);
  }, [change]);

  return { move, act, insert, editField, removing, confirmRemove: () => removing && remove(removing.id), cancelRemove: () => setRemoving(null) };
}
