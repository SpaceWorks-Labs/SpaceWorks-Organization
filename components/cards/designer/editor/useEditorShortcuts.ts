"use client";

import type { KeyboardEvent } from "react";
import { isTypingTarget, matchShortcut, NUDGE_BIG_MM, NUDGE_MM, type ShortcutAction } from "./shortcuts";
import type { EditorActions } from "./useEditorActions";

/** Keys that only act on the card: from the canvas, the layers list or the designer itself, never from other controls. */
const CANVAS_ONLY = new Set<ShortcutAction>(["delete", "nudgeLeft", "nudgeRight", "nudgeUp", "nudgeDown"]);

/**
 * The designer's key handler (see ./shortcuts.ts). Attach to the designer's root; it ignores keys
 * typed into fields and keys a focused control already handled.
 */
export function useEditorShortcuts({ actions, hasLayerSelection, hasSelection, clearSelection, undo, redo, zoom, openHelp }: {
  actions: EditorActions;
  hasLayerSelection: boolean;
  hasSelection: boolean;
  clearSelection: () => void;
  undo: () => void;
  redo: () => void;
  zoom: { in: () => void; out: () => void; fit: () => void };
  openHelp: () => void;
}) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    const target = event.target as HTMLElement;
    if (target.closest("[role=dialog]")) return;
    const action = matchShortcut(event);
    if (!action) return;
    if (CANVAS_ONLY.has(action) && !(target === event.currentTarget || target.closest("[data-editor-viewport], [data-layers-list]"))) return;
    const step = event.shiftKey ? NUDGE_BIG_MM : NUDGE_MM;
    const layerOnly: Partial<Record<ShortcutAction, () => void>> = {
      delete: actions.remove,
      copy: actions.copy,
      cut: actions.cut,
      duplicate: actions.duplicate,
      group: actions.group,
      ungroup: actions.ungroup,
      nudgeLeft: () => actions.nudge(-step, 0),
      nudgeRight: () => actions.nudge(step, 0),
      nudgeUp: () => actions.nudge(0, -step),
      nudgeDown: () => actions.nudge(0, step),
    };
    const any: Partial<Record<ShortcutAction, () => void>> = {
      paste: actions.paste,
      undo,
      redo,
      selectAll: actions.selectAll,
      help: openHelp,
      zoomIn: zoom.in,
      zoomOut: zoom.out,
      zoomFit: zoom.fit,
      escape: () => (actions.painting ? actions.stopPainting() : clearSelection()),
    };
    if (hasSelection) Object.assign(any, { forward: () => actions.order("forward"), backward: () => actions.order("backward"), front: () => actions.order("front"), back: () => actions.order("back") });
    const run = (hasLayerSelection ? layerOnly[action] : undefined) ?? any[action];
    if (!run) return;
    if (action === "escape" && !actions.painting && !hasSelection) return;
    event.preventDefault();
    run();
  };
}
