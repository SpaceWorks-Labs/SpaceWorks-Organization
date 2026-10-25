import { describe, expect, it } from "vitest";
import { addLayer, createLayer, duplicateLayer, moveInOrder, removeLayer, resizeBox, rotationTowards, updateLayer } from "@/lib/cards/design/layerEdit";
import { DEFAULT_ORDER, LAYER_ID_PATTERN, MAX_LAYERS, normalizeLayers, type CardLayer } from "@/lib/cards/design/layers";

const side = { widthMm: 85.6, heightMm: 54, layers: [] as CardLayer[], order: [...DEFAULT_ORDER] };

describe("layer edits", () => {
  it("creates centred layers with valid ids, on top of the stack", () => {
    const text = createLayer(side, "text")!;
    expect(text.id).toMatch(LAYER_ID_PATTERN);
    expect(text.xMm + text.wMm / 2).toBeCloseTo(side.widthMm / 2, 0);
    const next = addLayer(side, text);
    expect(next.order.at(-1)).toBe(text.id);
    // What the designer makes survives normalising.
    expect(normalizeLayers(next.layers, side)).toEqual(next.layers);
  });

  it("keeps an image's shape", () => {
    const wide = createLayer(side, "image", { url: "/x", aspect: 2 })!;
    expect(wide.wMm / wide.hMm).toBeCloseTo(2, 1);
    const tall = createLayer(side, "image", { url: "/x", aspect: 0.5 })!;
    expect(tall.hMm / tall.wMm).toBeCloseTo(2, 1);
  });

  it("refuses a layer past the limit", () => {
    let full = { ...side };
    for (let index = 0; index < MAX_LAYERS; index += 1) full = addLayer(full, createLayer(full, "rect")!);
    expect(createLayer(full, "text")).toBeNull();
    expect(duplicateLayer(full, full.layers[0]!.id).id).toBeNull();
  });

  it("updates, duplicates just above the original, and removes", () => {
    const a = createLayer(side, "rect")!;
    const b = createLayer(addLayer(side, a), "ellipse")!;
    const both = addLayer(addLayer(side, a), b);
    const updated = updateLayer(both, a.id, { opacityPct: 40 });
    expect(updated.layers[0]).toMatchObject({ opacityPct: 40 });
    const { side: copied, id } = duplicateLayer(updated, a.id);
    expect(copied.order.slice(-3)).toEqual([a.id, id, b.id]);
    expect(copied.layers.at(-1)).toMatchObject({ xMm: a.xMm + 3, opacityPct: 40 });
    const removed = removeLayer(copied, a.id);
    expect(removed.layers.map((layer) => layer.id)).toEqual([b.id, id]);
    expect(removed.order).not.toContain(a.id);
  });

  it("moves items through the stack", () => {
    expect(moveInOrder(side, "qr", "back").order[0]).toBe("qr");
    expect(moveInOrder(side, "header", "front").order.at(-1)).toBe("header");
    const forward = moveInOrder(side, "header", "forward").order;
    expect(forward.slice(0, 2)).toEqual(["name", "header"]);
    expect(moveInOrder(side, "qr", "forward").order).toEqual(side.order);
  });
});

describe("handle geometry", () => {
  const box = { xMm: 10, yMm: 10, wMm: 20, hMm: 10, rotationDeg: 0 };

  it("grows from the dragged edge and keeps the opposite one", () => {
    expect(resizeBox(box, { x: 1, y: 0 }, 5, 3, false)).toEqual({ ...box, wMm: 25 });
    expect(resizeBox(box, { x: -1, y: -1 }, -4, -2, false)).toEqual({ ...box, xMm: 6, yMm: 8, wMm: 24, hMm: 12 });
  });

  it("keeps the aspect from a corner when asked", () => {
    const grown = resizeBox(box, { x: 1, y: 1 }, 10, 0, true);
    expect(grown.wMm / grown.hMm).toBeCloseTo(2, 5);
  });

  it("resizes a turned box along its own axes", () => {
    // Turned 90°, dragging the right handle down the page widens it, and its left edge stays put.
    const turned = { ...box, rotationDeg: 90 };
    const grown = resizeBox(turned, { x: 1, y: 0 }, 0, 6, false);
    expect(grown.wMm).toBe(26);
    expect(grown.yMm + grown.hMm / 2).toBeCloseTo(18, 5);
  });

  it("points the top at the pointer, snapping to 15° with Shift", () => {
    expect(rotationTowards(box, { xMm: 40, yMm: 15 }, false)).toBe(90);
    expect(rotationTowards(box, { xMm: 20, yMm: 30 }, false)).toBe(180);
    // 35° off the vertical snaps to 30°; a true diagonal is 45°.
    expect(rotationTowards(box, { xMm: 27, yMm: 5 }, true)).toBe(30);
    expect(rotationTowards(box, { xMm: 30, yMm: 5 }, false)).toBe(45);
  });
});
