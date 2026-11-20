import type { AlignEdge } from "@/lib/cards/design/editor/align";
import type { OrderMove } from "@/lib/cards/design/layerEdit";

/*
 * Every control of the Arrange and Position panels with its accessible name, in one list so the
 * panels and their accessibility test read the same words. Icon-only buttons take `label` as their
 * name and tooltip; `shortcut` is added to the tooltip.
 */

export type ArrangeControl =
  | { id: `align-${AlignEdge}`; group: "align"; label: string; edge: AlignEdge }
  | { id: `distribute-${"x" | "y"}`; group: "align"; label: string; axis: "x" | "y" }
  | { id: `order-${OrderMove}`; group: "order"; label: string; move: OrderMove; shortcut: string }
  | { id: "group" | "ungroup" | "flip-x" | "flip-y" | "duplicate" | "copy" | "cut" | "paste" | "delete" | "lock" | "hide" | "copy-style" | "apply-style"; group: "edit"; label: string; shortcut?: string };

export const ALIGN_CONTROLS = [
  { id: "align-left", group: "align", label: "Align left", edge: "left" },
  { id: "align-centre", group: "align", label: "Align centres across", edge: "centre" },
  { id: "align-right", group: "align", label: "Align right", edge: "right" },
  { id: "align-top", group: "align", label: "Align top", edge: "top" },
  { id: "align-middle", group: "align", label: "Align middles down", edge: "middle" },
  { id: "align-bottom", group: "align", label: "Align bottom", edge: "bottom" },
  { id: "distribute-x", group: "align", label: "Space evenly across", axis: "x" },
  { id: "distribute-y", group: "align", label: "Space evenly down", axis: "y" },
] as const satisfies readonly ArrangeControl[];

export const ORDER_CONTROLS = [
  { id: "order-front", group: "order", label: "Bring to front", move: "front", shortcut: "Ctrl+Shift+]" },
  { id: "order-forward", group: "order", label: "Bring forward", move: "forward", shortcut: "Ctrl+]" },
  { id: "order-backward", group: "order", label: "Send backward", move: "backward", shortcut: "Ctrl+[" },
  { id: "order-back", group: "order", label: "Send to back", move: "back", shortcut: "Ctrl+Shift+[" },
] as const satisfies readonly ArrangeControl[];

export const EDIT_CONTROLS = [
  { id: "group", group: "edit", label: "Group", shortcut: "Ctrl+G" },
  { id: "ungroup", group: "edit", label: "Ungroup", shortcut: "Ctrl+Shift+G" },
  { id: "flip-x", group: "edit", label: "Flip horizontally" },
  { id: "flip-y", group: "edit", label: "Flip vertically" },
  { id: "duplicate", group: "edit", label: "Duplicate", shortcut: "Ctrl+D" },
  { id: "copy", group: "edit", label: "Copy", shortcut: "Ctrl+C" },
  { id: "cut", group: "edit", label: "Cut", shortcut: "Ctrl+X" },
  { id: "paste", group: "edit", label: "Paste", shortcut: "Ctrl+V" },
  { id: "delete", group: "edit", label: "Delete", shortcut: "Delete" },
  { id: "lock", group: "edit", label: "Lock" },
  { id: "hide", group: "edit", label: "Hide" },
  { id: "copy-style", group: "edit", label: "Copy style" },
  { id: "apply-style", group: "edit", label: "Apply copied style" },
] as const satisfies readonly ArrangeControl[];

/** The Position panel's fields and buttons. */
export const POSITION_CONTROLS = [
  { id: "x", label: "Left (mm)" },
  { id: "y", label: "Top (mm)" },
  { id: "w", label: "Width (mm)" },
  { id: "h", label: "Height (mm)" },
  { id: "rotation", label: "Turn (degrees)" },
  { id: "lock-ratio", label: "Keep proportions" },
  { id: "centre-x", label: "Centre across" },
  { id: "centre-y", label: "Centre down" },
  { id: "fill", label: "Fill the card" },
] as const;

export const withShortcut = (label: string, shortcut?: string) => (shortcut ? `${label} (${shortcut})` : label);
