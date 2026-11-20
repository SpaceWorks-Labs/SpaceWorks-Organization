import { describe, expect, it } from "vitest";
import { layerBounds, normalAngle, rectFromPoints, unionRect } from "@/lib/cards/design/editor/bounds";
import { equalSpacingTargets, snapRect, snapTargets, snapThresholdMm, spacingHints } from "@/lib/cards/design/editor/snapping";
import { CARD } from "../helpers/cardEditor";

const card = { ...CARD, safeMm: 3 };

describe("card editor bounds", () => {
  it("encloses a turned box", () => {
    const upright = layerBounds({ xMm: 10, yMm: 10, wMm: 20, hMm: 10, rotationDeg: 0 });
    expect(upright).toEqual({ x: 10, y: 10, w: 20, h: 10 });
    const quarter = layerBounds({ xMm: 10, yMm: 10, wMm: 20, hMm: 10, rotationDeg: 90 });
    expect(quarter.w).toBeCloseTo(10);
    expect(quarter.h).toBeCloseTo(20);
    expect(quarter.x + quarter.w / 2).toBeCloseTo(20);
  });

  it("joins rectangles and keeps angles in range", () => {
    expect(unionRect([{ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 2, w: 1, h: 3 }])).toEqual({ x: 0, y: 0, w: 6, h: 5 });
    expect(unionRect([])).toBeNull();
    expect(rectFromPoints({ x: 5, y: 1 }, { x: 2, y: 4 })).toEqual({ x: 2, y: 1, w: 3, h: 3 });
    expect(normalAngle(190)).toBe(-170);
    expect(normalAngle(-180)).toBe(180);
  });
});

describe("card editor snapping", () => {
  it("converts the screen threshold to millimetres", () => {
    expect(snapThresholdMm(6)).toBeCloseTo(1);
    expect(snapThresholdMm(3)).toBeCloseTo(2);
  });

  it("snaps a box's centre to the card's centre line and draws the guide", () => {
    const targets = snapTargets(card);
    const result = snapRect({ x: 32.3, y: 5, w: 20, h: 10 }, targets, 1);
    expect(result.dx).toBeCloseTo(0.5);
    expect(result.guides).toContainEqual(expect.objectContaining({ axis: "x", at: card.widthMm / 2, kind: "centre" }));
  });

  it("snaps edges to the safe zone and card edges, nearest first", () => {
    const targets = snapTargets(card);
    expect(snapRect({ x: 3.6, y: 0.4, w: 10, h: 10 }, targets, 1)).toMatchObject({ dx: expect.closeTo(-0.6), dy: expect.closeTo(-0.4) });
    expect(snapRect({ x: 20, y: 20, w: 10, h: 10 }, targets, 1)).toMatchObject({ dx: 0, dy: 0, guides: [] });
  });

  it("snaps to custom guides and other items, with guides spanning both", () => {
    const other = { x: 50, y: 30, w: 10, h: 10 };
    const targets = snapTargets({ ...card, guides: { x: [17], y: [] } }, [other]);
    expect(snapRect({ x: 17.5, y: 12, w: 4, h: 4 }, targets, 1).dx).toBeCloseTo(-0.5);
    const aligned = snapRect({ x: 20, y: 9.6, w: 10, h: 20.6 }, targets, 1);
    expect(aligned.dy).toBeCloseTo(-0.2);
    const line = aligned.guides.find((guide) => guide.axis === "y" && guide.at === 30);
    expect(line).toMatchObject({ from: 20, to: 60, kind: "item" });
  });

  it("only snaps the edges a resize moves", () => {
    const targets = snapTargets(card);
    const right = snapRect({ x: 3.5, y: 10, w: 79.8, h: 5 }, targets, 1, { x: ["end"], y: [] });
    expect(right.dx).toBeCloseTo(-0.7);
    expect(right.dy).toBe(0);
  });

  it("finds the equal-spacing position between two neighbours", () => {
    const left = { x: 0, y: 10, w: 10, h: 10 };
    const right = { x: 40, y: 10, w: 10, h: 10 };
    const box = { x: 19, y: 12, w: 10, h: 5 };
    const targets = equalSpacingTargets(box, [left, right]);
    expect(targets).toEqual([{ axis: "x", at: 25, kind: "spacing" }]);
    expect(snapRect(box, targets, 1).dx).toBeCloseTo(1);
  });

  it("measures gaps to neighbours and flags equal spacing", () => {
    const hints = spacingHints({ x: 20, y: 10, w: 10, h: 10 }, [{ x: 0, y: 10, w: 10, h: 10 }, { x: 40, y: 12, w: 10, h: 10 }]);
    const across = hints.filter((hint) => hint.axis === "x");
    expect(across.map((hint) => hint.gapMm)).toEqual([10, 10]);
    expect(across.every((hint) => hint.equal)).toBe(true);
    const withCard = spacingHints({ x: 20, y: 10, w: 10, h: 10 }, [], CARD);
    expect(withCard.find((hint) => hint.axis === "y" && hint.from === 0)?.gapMm).toBe(10);
  });
});
