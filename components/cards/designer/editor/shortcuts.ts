/*
 * The card designer's keyboard shortcuts: one list feeds both the key handler and the help dialog.
 * Shortcuts only run while focus is not in a text field.
 */

export type ShortcutAction =
  | "delete" | "copy" | "cut" | "paste" | "duplicate" | "group" | "ungroup"
  | "forward" | "backward" | "front" | "back" | "undo" | "redo" | "selectAll" | "escape" | "help"
  | "zoomIn" | "zoomOut" | "zoomFit" | "nudgeLeft" | "nudgeRight" | "nudgeUp" | "nudgeDown";

/** Arrow keys move the selection this far; with Shift, the bigger step. */
export const NUDGE_MM = 0.5;
export const NUDGE_BIG_MM = 5;

export const SHORTCUTS: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: "Arrow keys", label: `Move the selection ${NUDGE_MM} mm (Shift: ${NUDGE_BIG_MM} mm)` },
  { keys: "Shift + click", label: "Add to or take from the selection" },
  { keys: "Drag on the empty card", label: "Select everything the box touches" },
  { keys: "Ctrl + A", label: "Select every layer" },
  { keys: "Esc", label: "Clear the selection or stop copying a style" },
  { keys: "Delete or Backspace", label: "Delete the selected layers" },
  { keys: "Ctrl + C / X / V", label: "Copy, cut and paste (also onto the other side)" },
  { keys: "Ctrl + D", label: "Duplicate" },
  { keys: "Ctrl + G", label: "Group" },
  { keys: "Ctrl + Shift + G", label: "Ungroup" },
  { keys: "Ctrl + ] / [", label: "Bring forward / send backward" },
  { keys: "Ctrl + Shift + ] / [", label: "Bring to front / send to back" },
  { keys: "Ctrl + Z", label: "Undo" },
  { keys: "Ctrl + Shift + Z or Ctrl + Y", label: "Redo" },
  { keys: "Ctrl + + / − / 0", label: "Zoom in, zoom out, fit the card" },
  { keys: "Ctrl + scroll", label: "Zoom" },
  { keys: "Space + drag", label: "Pan around the card" },
  { keys: "Shift while resizing", label: "Keep proportions (pictures: change them)" },
  { keys: "Shift while turning", label: "Turn in 15° steps" },
  { keys: "Alt while dragging", label: "Place freely, without snapping" },
  { keys: "?", label: "Show these shortcuts" },
];

type KeyInput = { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

/** The action a key press asks for, or null. Ctrl and Cmd are the same. */
export function matchShortcut(event: KeyInput): ShortcutAction | null {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (mod) {
    if (key === "z") return event.shiftKey ? "redo" : "undo";
    if (key === "y") return "redo";
    if (key === "c") return "copy";
    if (key === "x") return "cut";
    if (key === "v") return "paste";
    if (key === "d") return "duplicate";
    if (key === "a") return "selectAll";
    if (key === "g") return event.shiftKey ? "ungroup" : "group";
    if (key === "]" || key === "}" || event.code === "BracketRight") return event.shiftKey ? "front" : "forward";
    if (key === "[" || key === "{" || event.code === "BracketLeft") return event.shiftKey ? "back" : "backward";
    if (key === "=" || key === "+") return "zoomIn";
    if (key === "-" || key === "_") return "zoomOut";
    if (key === "0") return "zoomFit";
    return null;
  }
  if (event.altKey) return null;
  if (key === "Delete" || key === "Backspace") return "delete";
  if (key === "Escape") return "escape";
  if (key === "?") return "help";
  if (key === "ArrowLeft") return "nudgeLeft";
  if (key === "ArrowRight") return "nudgeRight";
  if (key === "ArrowUp") return "nudgeUp";
  if (key === "ArrowDown") return "nudgeDown";
  return null;
}

/** Whether a key press comes from somewhere typing happens, where shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest?.("input, textarea, select, [contenteditable=true], [contenteditable='']"));
}
