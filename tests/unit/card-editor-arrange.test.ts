import { describe, expect, it } from "vitest";
import { alignLayers, distributeLayers } from "@/lib/cards/design/editor/align";
import { layerBounds } from "@/lib/cards/design/editor/bounds";
import { expandToGroups, groupLayers, isOneGroup, moveLayers, newGroupId, rotateLayers, scaleLayers, turnDelta, ungroupLayers } from "@/lib/cards/design/editor/groups";
import { canMoveInOrder, moveManyInOrder } from "@/lib/cards/design/editor/order";
import { GROUP_ID_PATTERN, type CardLayer } from "@/lib/cards/design/layerTypes";
import { CARD, rect, text } from "../helpers/cardEditor";

const byId = (layers: CardLayer[], id: string) => layers.find((layer) => layer.id === id)!;

describe("card editor align and distribute", () => {
  const layers = [rect("la001", 10, 10, 10, 10), rect("lb001", 30, 20, 20, 5), rect("lc001", 60, 5, 5, 30)];

  it("aligns several items to the selection's bounds", () => {
    const left = alignLayers(layers, ["la001", "lb001", "lc001"], "left", CARD);
    expect(left.map((layer) => layer.xMm)).toEqual([10, 10, 10]);
    const bottom = alignLayers(layers, ["la001", "lb001", "lc001"], "bottom", CARD);
    expect(bottom.map((layer) => layer.yMm + layer.hMm)).toEqual([35, 35, 35]);
    const centre = alignLayers(layers, ["la001", "lb001"], "centre", CARD);
    expect(byId(centre, "la001").xMm + 5).toBeCloseTo(byId(centre, "lb001").xMm + 10);
  });

  it("aligns one item to the card, using its turned bounds", () => {
    const turned = [rect("la001", 10, 10, 20, 10, { rotationDeg: 90 })];
    const right = alignLayers(turned, ["la001"], "right", CARD);
    expect(layerBounds(right[0]!).x + layerBounds(right[0]!).w).toBeCloseTo(CARD.widthMm, 0);
    const middle = alignLayers(turned, ["la001"], "middle", CARD);
    expect(middle[0]!.yMm + 5).toBeCloseTo(CARD.heightMm / 2, 0);
  });

  it("moves a group as one item and leaves locked layers alone", () => {
    const grouped = [rect("la001", 10, 10, 10, 10, { groupId: "gaaaa" }), rect("lb001", 25, 10, 10, 10, { groupId: "gaaaa" }), rect("lc001", 50, 30, 10, 10, { locked: true })];
    const aligned = alignLayers(grouped, ["la001", "lb001"], "left", CARD);
    expect(aligned.map((layer) => layer.xMm)).toEqual([0, 15, 50]);
  });

  it("distributes three or more with equal gaps, outermost fixed", () => {
    const spread = distributeLayers([rect("la001", 0, 0, 10, 5), rect("lb001", 12, 0, 6, 5), rect("lc001", 50, 0, 10, 5)], ["la001", "lb001", "lc001"], "x");
    expect(spread.map((layer) => layer.xMm)).toEqual([0, 27, 50]);
    expect(distributeLayers(layers.slice(0, 2), ["la001", "lb001"], "x")).toEqual(layers.slice(0, 2));
  });
});

describe("card editor groups", () => {
  it("groups, expands a selection to whole groups and ungroups", () => {
    const id = newGroupId();
    expect(id).toMatch(GROUP_ID_PATTERN);
    const grouped = groupLayers([rect("la001", 0, 0, 5, 5), rect("lb001", 10, 0, 5, 5), rect("lc001", 20, 0, 5, 5)], ["la001", "lb001"], id);
    expect(expandToGroups(grouped, ["lb001"])).toEqual(["la001", "lb001"]);
    expect(isOneGroup(grouped, ["la001", "lb001"])).toBe(true);
    expect(isOneGroup(grouped, ["la001", "lb001", "lc001"])).toBe(false);
    expect(ungroupLayers(grouped, ["la001"]).every((layer) => layer.groupId === null)).toBe(true);
    expect(groupLayers(grouped, ["lc001"])).toEqual(grouped);
  });

  it("moves, scales about the group box and turns about its centre", () => {
    const layers = [rect("la001", 0, 0, 10, 10), text("lb001", 10, 10, 10, 10)];
    expect(moveLayers(layers, ["la001"], 2, 3)[0]).toMatchObject({ xMm: 2, yMm: 3 });
    const scaled = scaleLayers(layers, ["la001", "lb001"], { x: 0, y: 0, w: 20, h: 20 }, { x: 0, y: 0, w: 40, h: 40 });
    expect(scaled[0]).toMatchObject({ xMm: 0, yMm: 0, wMm: 20, hMm: 20 });
    expect(scaled[1]).toMatchObject({ xMm: 20, yMm: 20, wMm: 20, sizePt: 24 });
    const turned = rotateLayers(layers, ["la001", "lb001"], { x: 10, y: 10 }, 180);
    expect(turned[0]).toMatchObject({ xMm: 10, yMm: 10, rotationDeg: 180 });
    expect(turned[1]).toMatchObject({ xMm: 0, yMm: 0 });
  });

  it("measures a group turn from the drag start, snapping to 15° with Shift", () => {
    const centre = { x: 0, y: 0 };
    expect(turnDelta(centre, { x: 0, y: -10 }, { x: 10, y: 0 }, false)).toBe(90);
    expect(turnDelta(centre, { x: 0, y: -10 }, { x: 10, y: -9 }, true)).toBe(45);
  });
});

describe("card editor stacking", () => {
  const order = ["header", "a", "b", "c", "d", "name"];
  it("keeps the selection's own order when moving it", () => {
    expect(moveManyInOrder(order, ["b", "d"], "front")).toEqual(["header", "a", "c", "name", "b", "d"]);
    expect(moveManyInOrder(order, ["b", "d"], "back")).toEqual(["b", "d", "header", "a", "c", "name"]);
    expect(moveManyInOrder(order, ["b", "c"], "forward")).toEqual(["header", "a", "d", "b", "c", "name"]);
    expect(moveManyInOrder(order, ["a", "b"], "backward")).toEqual(["a", "b", "header", "c", "d", "name"]);
  });

  it("knows when a move would change nothing", () => {
    expect(canMoveInOrder(order, ["name"], "front")).toBe(false);
    expect(canMoveInOrder(order, ["d", "name"], "forward")).toBe(false);
    expect(canMoveInOrder(order, ["header"], "back")).toBe(false);
    expect(canMoveInOrder(order, ["a"], "back")).toBe(true);
  });
});
