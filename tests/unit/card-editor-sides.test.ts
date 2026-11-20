import { describe, expect, it } from "vitest";
import { cloneLayers, copySideLayout, duplicateSide } from "@/lib/cards/design/editor/sideCopy";
import { defaultCardSideSettings } from "@/lib/cards/design/normalize";
import { GROUP_ID_PATTERN, LAYER_ID_PATTERN, type CardLayer } from "@/lib/cards/design/layerTypes";
import { rect, text } from "../helpers/cardEditor";

const context = { organisationName: "Example", planName: "Life" };

function front() {
  const base = defaultCardSideSettings(context);
  const layers = [rect("la001", 1, 1, 5, 5, { groupId: "gaaaa" }), rect("lb001", 9, 1, 5, 5, { groupId: "gaaaa" }), text("lc001", 2, 20, 30, 8)] as CardLayer[];
  return { ...base, heading: "Front heading", layers, order: [...base.order, ...layers.map((layer) => layer.id)], elementPositions: { ...base.elementPositions, name: { xMm: 12, yMm: 34 } } };
}

describe("card editor side copies", () => {
  it("clones layers with new ids, keeping groups together but separate from the originals", () => {
    const { layers, ids } = cloneLayers(front().layers);
    expect(layers.every((layer) => LAYER_ID_PATTERN.test(layer.id) && !["la001", "lb001", "lc001"].includes(layer.id))).toBe(true);
    expect(layers[0]!.groupId).toMatch(GROUP_ID_PATTERN);
    expect(layers[0]!.groupId).toBe(layers[1]!.groupId);
    expect(layers[0]!.groupId).not.toBe("gaaaa");
    expect(layers[2]!.groupId).toBeNull();
    expect(ids.get("lc001")).toBe(layers[2]!.id);
  });

  it("copies the layout onto the other side and keeps that side's own words", () => {
    const source = front();
    const back = { ...defaultCardSideSettings(context), heading: "Back heading" };
    const copied = copySideLayout(source, back);
    expect(copied.heading).toBe("Back heading");
    expect(copied.elementPositions.name).toEqual({ xMm: 12, yMm: 34 });
    expect(copied.layers).toHaveLength(3);
    expect(copied.order.slice(-3)).toEqual(copied.layers.map((layer) => layer.id));
    expect(copied.layers[2]).toMatchObject({ kind: "text", xMm: 2, yMm: 20 });
    // The source is untouched.
    expect(source.layers[0]!.id).toBe("la001");
  });

  it("duplicates a whole side with new layer ids", () => {
    const source = front();
    const copy = duplicateSide(source);
    expect(copy.heading).toBe("Front heading");
    expect(copy.layers.map((layer) => layer.id)).not.toContain("la001");
    expect(copy.order).not.toContain("la001");
    copy.elementPositions.name.xMm = 99;
    expect(source.elementPositions.name.xMm).toBe(12);
  });
});
