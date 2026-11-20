import { describe, expect, it } from "vitest";
import { checkpoint, COALESCE_MS, emptyHistory, HISTORY_LIMIT, redo, undo } from "@/lib/cards/design/editor/history";
import { centreOnCard, editSelectionBox, fillCard, selectionBox } from "@/lib/cards/design/editor/position";
import { relayoutLayers } from "@/lib/cards/design/editor/relayout";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import { LAYER_DEFAULTS } from "@/lib/cards/design/layerTypes";
import { CARD, rect, text } from "../helpers/cardEditor";

const PORTRAIT = { widthMm: 54, heightMm: 85.6 };

describe("card editor re-layout", () => {
  it("keeps edge-anchored bands on their edge and spanning the card", () => {
    const [band] = relayoutLayers([rect("la001", 0, 0, 85.6, 10)], CARD, PORTRAIT);
    expect(band).toMatchObject({ xMm: 0, yMm: 0, wMm: 54 });
    const [bottom] = relayoutLayers([rect("la001", 0, 44, 85.6, 10)], CARD, PORTRAIT);
    expect(bottom!.yMm + bottom!.hMm).toBeCloseTo(85.6, 0);
  });

  it("keeps pictures' shape and moves centres in proportion", () => {
    const photo = { ...LAYER_DEFAULTS, id: "la001", kind: "photo", xMm: 37.8, yMm: 22, wMm: 10, hMm: 10, mask: "circle", stroke: null, strokeMm: 0.5, placeholder: "" } as CardLayer;
    const [moved] = relayoutLayers([photo], CARD, PORTRAIT);
    expect(moved!.wMm).toBe(moved!.hMm);
    expect(moved!.xMm + moved!.wMm / 2).toBeCloseTo(27, 0);
    expect(moved!.yMm + moved!.hMm / 2).toBeCloseTo(42.8, 0);
  });

  it("scales text by the smaller scale", () => {
    const [scaled] = relayoutLayers([text("la001", 10, 10, 40, 8, { sizePt: 20 } as Partial<CardLayer>)], CARD, PORTRAIT);
    expect((scaled as { sizePt: number }).sizePt).toBeCloseTo(20 * (54 / 85.6), 0);
    expect(relayoutLayers([text("la001", 10, 10, 40, 8)], CARD, CARD)[0]!.xMm).toBe(10);
  });
});

describe("card editor position panel", () => {
  it("edits one layer's box with and without the ratio locked", () => {
    const layers = [rect("la001", 5, 5, 20, 10)];
    expect(editSelectionBox(layers, ["la001"], "w", 40, true)[0]).toMatchObject({ wMm: 40, hMm: 20 });
    expect(editSelectionBox(layers, ["la001"], "h", 20, false)[0]).toMatchObject({ wMm: 20, hMm: 20 });
    expect(editSelectionBox(layers, ["la001"], "rotation", 270, false)[0]).toMatchObject({ rotationDeg: -90 });
    expect(editSelectionBox(layers, ["la001"], "x", Number.NaN, false)).toEqual(layers);
  });

  it("moves and stretches a selection through its bounds", () => {
    const layers = [rect("la001", 0, 0, 10, 10), rect("lb001", 10, 10, 10, 10)];
    expect(selectionBox(layers, ["la001", "lb001"])).toEqual({ x: 0, y: 0, w: 20, h: 20, rotation: null });
    expect(editSelectionBox(layers, ["la001", "lb001"], "x", 5, false).map((layer) => layer.xMm)).toEqual([5, 15]);
    const wider = editSelectionBox(layers, ["la001", "lb001"], "w", 40, true);
    expect(wider[1]).toMatchObject({ xMm: 20, yMm: 20, wMm: 20, hMm: 20 });
  });

  it("centres and fills the card", () => {
    const layers = [rect("la001", 0, 0, 10, 10)];
    expect(centreOnCard(layers, ["la001"], "x", CARD)[0]!.xMm).toBeCloseTo(37.8);
    expect(fillCard(layers, ["la001"], CARD)[0]).toMatchObject({ xMm: 0, yMm: 0, wMm: 85.6, hMm: 54 });
  });
});

describe("card editor history", () => {
  it("coalesces quick edits and keeps a bounded past", () => {
    let history = checkpoint(emptyHistory<number>(), 1, false, 1000);
    history = checkpoint(history, 2, true, 1000 + COALESCE_MS - 1);
    expect(history.past).toEqual([1]);
    history = checkpoint(history, 3, true, 1000 + COALESCE_MS * 3);
    expect(history.past).toEqual([1, 3]);
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) history = checkpoint(history, index, false, index);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
  });

  it("undoes and redoes", () => {
    const history = checkpoint(emptyHistory<string>(), "a", false, 0);
    const back = undo(history, "b")!;
    expect(back.state).toBe("a");
    expect(redo(back.history, "a")!.state).toBe("b");
    expect(undo(emptyHistory<string>(), "x")).toBeNull();
    expect(redo(history, "x")).toBeNull();
  });
});
