import { describe, expect, it } from "vitest";
import { canFlipSelection, copyLayers, deleteLayers, duplicateLayers, flipLayers, pasteLayers } from "@/lib/cards/design/editor/clipboard";
import { applyStyle, applyStyleTo, copyStyle, styleFits } from "@/lib/cards/design/editor/style";
import { GROUP_ID_PATTERN, LAYER_ID_PATTERN, MAX_LAYERS, type CardLayer } from "@/lib/cards/design/layerTypes";
import { LAYER_DEFAULTS } from "@/lib/cards/design/layerTypes";
import { rect, side, text } from "../helpers/cardEditor";

describe("card editor clipboard", () => {
  const grouped = side([rect("la001", 10, 10, 10, 10, { groupId: "gaaaa" }), rect("lb001", 30, 10, 10, 10, { groupId: "gaaaa" }), text("lc001", 5, 40, 30, 8)]);

  it("copies bottom first and pastes with new ids, new group ids and an offset", () => {
    const clip = copyLayers(grouped, ["lb001", "la001"])!;
    expect(clip.layers.map((layer) => layer.id)).toEqual(["la001", "lb001"]);
    const pasted = pasteLayers(grouped, clip)!;
    expect(pasted.ids).toHaveLength(2);
    const copies = pasted.side.layers.slice(-2);
    for (const copy of copies) {
      expect(copy.id).toMatch(LAYER_ID_PATTERN);
      expect(copy.groupId).toMatch(GROUP_ID_PATTERN);
      expect(copy.groupId).not.toBe("gaaaa");
    }
    expect(copies[0]!.groupId).toBe(copies[1]!.groupId);
    expect(copies[0]).toMatchObject({ xMm: 13, yMm: 13 });
    expect(pasted.side.order.slice(-2)).toEqual(pasted.ids);
    // A second paste steps further.
    expect(pasteLayers(pasted.side, pasted.clipboard)!.side.layers.at(-2)).toMatchObject({ xMm: 16 });
  });

  it("pastes in place on the other side or after a cut", () => {
    const clip = copyLayers(grouped, ["lc001"])!;
    const other = side([]);
    expect(pasteLayers(other, clip)!.side.layers[0]).toMatchObject({ xMm: 5, yMm: 40 });
  });

  it("refuses a paste or duplicate past the layer limit", () => {
    const full = side(Array.from({ length: MAX_LAYERS }, (_, index) => rect(`lx${String(index).padStart(3, "0")}`, 0, 0, 5, 5)));
    expect(pasteLayers(full, copyLayers(grouped, ["la001"])!)).toBeNull();
    expect(duplicateLayers(full, ["lx000"])).toBeNull();
  });

  it("duplicates just above the topmost selected layer", () => {
    const result = duplicateLayers(grouped, ["la001", "lb001"])!;
    expect(result.side.order.indexOf(result.ids[0]!)).toBe(result.side.order.indexOf("lb001") + 1);
    expect(result.side.order.at(-1)).toBe("lc001");
  });

  it("deletes everything selected but locked layers", () => {
    const locked = side([rect("la001", 0, 0, 5, 5), rect("lb001", 0, 0, 5, 5, { locked: true })]);
    const result = deleteLayers(locked, ["la001", "lb001"]);
    expect(result.layers.map((layer) => layer.id)).toEqual(["lb001"]);
    expect(result.order).not.toContain("la001");
  });
});

describe("card editor flip", () => {
  it("mirrors one layer's artwork in place and reverses its turn", () => {
    const [flipped] = flipLayers([rect("la001", 10, 10, 10, 10, { rotationDeg: 30 })], ["la001"], "x");
    expect(flipped).toMatchObject({ flipX: true, xMm: 10, rotationDeg: -30 });
    expect(flipLayers([text("la001", 0, 0, 5, 5)], ["la001"], "x")[0]).toMatchObject({ xMm: 0, rotationDeg: 0 });
    expect(canFlipSelection([text("la001", 0, 0, 5, 5)], ["la001"])).toBe(false);
  });

  it("mirrors a selection's positions about its centre", () => {
    const flipped = flipLayers([rect("la001", 0, 0, 10, 10), text("lb001", 30, 0, 10, 10)], ["la001", "lb001"], "x");
    expect(flipped[0]).toMatchObject({ xMm: 30, flipX: true });
    expect(flipped[1]).toMatchObject({ xMm: 0, flipX: false });
  });
});

describe("card editor copy style", () => {
  it("lays a shape's whole style on another shape", () => {
    const source = rect("la001", 0, 0, 5, 5, { fill: "#FF0000", stroke: "#00FF00", strokeMm: 1, opacityPct: 50 } as Partial<CardLayer>);
    const target = rect("lb001", 20, 20, 8, 8);
    const styled = applyStyle(target, copyStyle(source));
    expect(styled).toMatchObject({ fill: "#FF0000", stroke: "#00FF00", strokeMm: 1, opacityPct: 50, xMm: 20, wMm: 8, id: "lb001" });
  });

  it("gives other kinds the main colour and opacity only", () => {
    const style = copyStyle(rect("la001", 0, 0, 5, 5, { fill: "#FF0000" } as Partial<CardLayer>));
    const target = text("lb001", 0, 0, 5, 5, { font: "inter" } as Partial<CardLayer>);
    expect(styleFits(style, target)).toBe(true);
    expect(applyStyle(target, style)).toMatchObject({ color: "#FF0000", font: "inter" });
    const fromText = copyStyle(text("lc001", 0, 0, 5, 5, { sizePt: 20, color: "#0000FF" } as Partial<CardLayer>));
    expect(applyStyleTo([text("ld001", 0, 0, 5, 5), text("le001", 0, 0, 5, 5, { locked: true })], ["ld001", "le001"], fromText).map((layer) => (layer as { sizePt: number }).sizePt)).toEqual([20, 12]);
  });

  it("has nothing but opacity for a picture from text", () => {
    const image = { ...LAYER_DEFAULTS, id: "lf001", kind: "image", xMm: 0, yMm: 0, wMm: 5, hMm: 5, url: "/x", fit: "cover", radiusMm: 0, grayscale: false, mask: "none", crop: { zoom: 1, xPct: 50, yPct: 50 }, adjust: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }, shadow: null, alt: "" } as CardLayer;
    expect(styleFits(copyStyle(text("la001", 0, 0, 5, 5)), image)).toBe(false);
  });
});
