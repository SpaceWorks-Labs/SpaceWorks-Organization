"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { InlineField } from "./inlineFields";
import styles from "./editor.module.css";

/** What is being edited in place: the field, the element that shows it, and its value when editing began. */
export type InlineEditing = { sectionId: string; field: InlineField; element: HTMLElement; original: string };

const COPIED = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textAlign", "textTransform", "color", "fontFeatureSettings", "fontVariationSettings"] as const;
const normal = (value: string) => value.replace(/\s+/g, " ").trim();
const px = (value: string) => Number.parseFloat(value) || 0;

/** The element showing `value` inside `root`, when React replaced the one editing began on. */
function relocate(root: HTMLElement | null, value: string): HTMLElement | null {
  if (!root || !normal(value)) return null;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (normal(node.nodeValue ?? "") === normal(value)) return node.parentElement;
  return null;
}

/**
 * A plain-text box laid exactly over the text being edited, in the same type, while the text underneath is hidden
 * (`data-inline-editing`). The document changes as you type, so the real renderer redraws around it. Enter (one-line
 * fields) or leaving the box finishes; Escape puts the text back. Nothing is stored as HTML.
 */
export function InlineTextEditor({ editing, value, host, root, onChange, onDone }: {
  editing: InlineEditing;
  value: string;
  /** The positioned canvas page the box is placed in. */
  host: HTMLElement;
  /** The section's rendered content, to find the text again after a redraw. */
  root: HTMLElement | null;
  onChange: (value: string) => void;
  onDone: () => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const element = useRef(editing.element);
  const [type] = useState<CSSProperties>(() => {
    const computed = window.getComputedStyle(editing.element);
    return Object.fromEntries(COPIED.map((key) => [key, computed[key]])) as CSSProperties;
  });
  const [place, setPlace] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Hide the rendered text while the box covers it, and show it again afterwards.
  useEffect(() => {
    const shown = element.current;
    return () => shown.removeAttribute("data-inline-editing");
  }, []);

  useLayoutEffect(() => {
    if (!element.current.isConnected) {
      const found = relocate(root, value);
      if (found) element.current = found;
    }
    const target = element.current;
    target.setAttribute("data-inline-editing", "");
    if (target.isConnected) {
      const rect = target.getBoundingClientRect();
      const frame = host.getBoundingClientRect();
      const computed = window.getComputedStyle(target);
      const left = px(computed.paddingLeft) + px(computed.borderLeftWidth);
      const right = px(computed.paddingRight) + px(computed.borderRightWidth);
      const top = px(computed.paddingTop) + px(computed.borderTopWidth);
      const bottom = px(computed.paddingBottom) + px(computed.borderBottomWidth);
      setPlace({ left: rect.left - frame.left + left, top: rect.top - frame.top + top, width: Math.max(rect.width - left - right, 48), height: Math.max(rect.height - top - bottom, 20) });
    }
    const area = box.current;
    if (area) {
      area.style.height = "auto";
      area.style.height = `${area.scrollHeight}px`;
    }
  }, [value, host, root]);

  useEffect(() => {
    const area = box.current;
    if (!area) return;
    area.focus({ preventScroll: true });
    if (editing.field.multiline) area.setSelectionRange(area.value.length, area.value.length);
    else area.select();
  }, [editing.field.multiline]);

  return (
    <textarea
      ref={box}
      aria-label={`Edit ${editing.field.path.split(".").at(-1) === "label" ? "button label" : "text"}`}
      value={value}
      maxLength={editing.field.max}
      rows={1}
      spellCheck
      className={styles.inline}
      style={{ ...type, ...(place ?? { visibility: "hidden" }), minHeight: place?.height }}
      onChange={(event) => onChange(editing.field.multiline ? event.target.value : event.target.value.replace(/[\r\n]+/g, " "))}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onChange(editing.original);
          onDone();
        } else if (event.key === "Enter" && !event.nativeEvent.isComposing && (!editing.field.multiline || event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          onDone();
        }
      }}
    />
  );
}
