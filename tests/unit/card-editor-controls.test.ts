import { describe, expect, it } from "vitest";
import { ALIGN_CONTROLS, EDIT_CONTROLS, ORDER_CONTROLS, POSITION_CONTROLS, withShortcut } from "@/components/cards/designer/editor/arrangeControls";
import { isTypingTarget, matchShortcut, SHORTCUTS } from "@/components/cards/designer/editor/shortcuts";
import { handleEdges, otherRects, resizeSelection, rotateSelection } from "@/components/cards/designer/editor/transformMath";
import { stepZoom, fitPxPerMm } from "@/components/cards/designer/editor/useZoom";
import { snapTargets } from "@/lib/cards/design/editor/snapping";
import { CARD, rect } from "../helpers/cardEditor";

const press = (key: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; code: string }> = {}) =>
  matchShortcut({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra });

describe("card editor shortcuts", () => {
  it("maps the documented keys", () => {
    expect(press("z", { ctrlKey: true })).toBe("undo");
    expect(press("Z", { ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(press("y", { metaKey: true })).toBe("redo");
    expect(press("g", { ctrlKey: true })).toBe("group");
    expect(press("G", { ctrlKey: true, shiftKey: true })).toBe("ungroup");
    expect(press("]", { ctrlKey: true })).toBe("forward");
    expect(press("}", { ctrlKey: true, shiftKey: true, code: "BracketRight" })).toBe("front");
    expect(press("{", { ctrlKey: true, shiftKey: true, code: "BracketLeft" })).toBe("back");
    expect(press("=", { ctrlKey: true })).toBe("zoomIn");
    expect(press("0", { ctrlKey: true })).toBe("zoomFit");
    expect(press("Backspace")).toBe("delete");
    expect(press("?", { shiftKey: true })).toBe("help");
    expect(press("ArrowUp", { shiftKey: true })).toBe("nudgeUp");
    expect(press("a")).toBeNull();
    expect(press("ArrowUp", { altKey: true })).toBeNull();
  });

  it("never fires while typing", () => {
    const input = { closest: (selector: string) => (selector.includes("input") ? {} : null) };
    expect(isTypingTarget(input as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ closest: () => null } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("lists every shortcut in sentence case for the help dialog", () => {
    for (const shortcut of SHORTCUTS) expect(shortcut.label[0]).toBe(shortcut.label[0]!.toUpperCase());
    expect(new Set(SHORTCUTS.map((shortcut) => shortcut.keys)).size).toBe(SHORTCUTS.length);
  });
});

describe("card editor panel controls", () => {
  const all = [...ALIGN_CONTROLS, ...ORDER_CONTROLS, ...EDIT_CONTROLS, ...POSITION_CONTROLS];

  it("gives every control a unique, sentence-case accessible name", () => {
    expect(new Set(all.map((control) => control.id)).size).toBe(all.length);
    expect(new Set(all.map((control) => control.label)).size).toBe(all.length);
    for (const control of all) {
      expect(control.label.trim()).not.toBe("");
      expect(control.label[0]).toBe(control.label[0]!.toUpperCase());
      expect(control.label.slice(1)).not.toMatch(/\b[A-Z][a-z]/);
      expect(control.label).not.toMatch(/!/);
    }
  });

  it("names a shortcut in the tooltip when there is one", () => {
    expect(withShortcut("Group", "Ctrl+G")).toBe("Group (Ctrl+G)");
    expect(withShortcut("Flip horizontally")).toBe("Flip horizontally");
  });
});

describe("card editor pointer transforms", () => {
  const layers = [rect("la001", 10, 10, 20, 10), rect("lb001", 40, 10, 10, 10)];

  it("resizes one layer and snaps its moving edge", () => {
    const targets = snapTargets({ ...CARD, safeMm: 3 });
    const result = resizeSelection(layers, ["la001"], { x: 10, y: 10, w: 20, h: 10 }, { x: 1, y: 0 }, 12.6, 0, false, { targets, threshold: 1 });
    expect(result.layers[0]).toMatchObject({ xMm: 10, wMm: 32.8 });
    expect(result.guides).toContainEqual(expect.objectContaining({ axis: "x", at: CARD.widthMm / 2 }));
    expect(handleEdges({ x: -1, y: 1 })).toEqual({ x: ["start"], y: ["end"] });
  });

  it("resizes several layers through their bounds, keeping proportions from a corner", () => {
    const bounds = { x: 10, y: 10, w: 40, h: 10 };
    const result = resizeSelection(layers, ["la001", "lb001"], bounds, { x: 1, y: 1 }, 40, 0, false, null);
    expect(result.layers[1]).toMatchObject({ xMm: 70, wMm: 20, hMm: 20 });
  });

  it("turns one layer towards the pointer and several about their centre", () => {
    const one = rotateSelection(layers, ["la001"], { x: 10, y: 10, w: 20, h: 10 }, { x: 20, y: 0 }, { x: 40, y: 15 }, false);
    expect(one[0]!.rotationDeg).toBe(90);
    const both = rotateSelection(layers, ["la001", "lb001"], { x: 10, y: 10, w: 40, h: 10 }, { x: 30, y: 0 }, { x: 60, y: 15 }, true);
    expect(both.map((layer) => layer.rotationDeg)).toEqual([90, 90]);
    expect(otherRects(layers, ["la001"])).toEqual([{ x: 40, y: 10, w: 10, h: 10 }]);
  });
});

describe("card editor zoom", () => {
  it("steps through the zoom levels within 50–400%", () => {
    expect(stepZoom(100, 1)).toBe(125);
    expect(stepZoom(137, -1)).toBe(125);
    expect(stepZoom(400, 1)).toBe(400);
    expect(stepZoom(50, -1)).toBe(50);
    expect(fitPxPerMm({ w: 0, h: 0 }, CARD)).toBe(4);
    expect(fitPxPerMm({ w: 600, h: 500 }, CARD)).toBeGreaterThan(5);
  });
});
