import { describe, expect, it } from "vitest";
import { code128, CODE128_PATTERNS, QUIET_MODULES } from "@/lib/cards/design/barcode";
import { CARD_ICONS, cardIcon } from "@/lib/cards/design/icons";
import { SHAPE_TYPES } from "@/lib/cards/design/layerTypes";
import { fullStops, gradientGeometry, patternCmds } from "@/lib/cards/design/paint";
import { parseShapePath, pathD } from "@/lib/cards/design/path";
import { shapeCmds } from "@/lib/cards/design/shapes";
import { curveGeometry } from "@/lib/cards/design/textCurve";
import { cropRegion } from "@/lib/cards/imageArt";
import { applyCase } from "@/lib/cards/layerOps/textOps";

/* The shared geometry behind the canvas, the PNG and the PDF. */

const points = (cmds: ReturnType<typeof shapeCmds>) => cmds.flatMap((cmd) => (cmd[0] === "Z" ? [] : (cmd.slice(1) as number[])));

describe("shape outlines", () => {
  it("stays inside its box for every shape", () => {
    for (const shape of SHAPE_TYPES) {
      const cmds = shapeCmds({ shape, points: 7, depthPct: 50, radiusMm: 2, path: "M0 0L100 0L50 100Z" }, 30, 20);
      expect(cmds.length, shape).toBeGreaterThan(2);
      const xs = points(cmds).filter((_, i) => i % 2 === 0);
      const ys = points(cmds).filter((_, i) => i % 2 === 1);
      expect(Math.min(...xs), shape).toBeGreaterThanOrEqual(-0.01);
      expect(Math.max(...xs), shape).toBeLessThanOrEqual(30.01);
      expect(Math.min(...ys), shape).toBeGreaterThanOrEqual(-0.01);
      expect(Math.max(...ys), shape).toBeLessThanOrEqual(20.01);
    }
  });

  it("draws a star with two points per tip and a frame as two outlines", () => {
    expect(shapeCmds({ shape: "star", points: 5, depthPct: 40, radiusMm: 0, path: "" }, 10, 10).filter((cmd) => cmd[0] !== "Z")).toHaveLength(10);
    expect(shapeCmds({ shape: "frame", points: 5, depthPct: 20, radiusMm: 2, path: "" }, 40, 20).filter((cmd) => cmd[0] === "M")).toHaveLength(2);
  });

  it("parses custom paths into absolute commands only, raising quadratics to cubics", () => {
    const cmds = parseShapePath("M0 0 L 100 0 Q 50 100 0 0 Z")!;
    expect(cmds.map((cmd) => cmd[0])).toEqual(["M", "L", "C", "Z"]);
    expect(parseShapePath("L0 0")).toBeNull();
    expect(pathD([["M", 1.23456, 2], ["Z"]])).toBe("M1.235 2Z");
  });
});

describe("paint", () => {
  it("runs linear gradients corner to corner like CSS and radial ones to the corners", () => {
    expect(gradientGeometry({ type: "linear", angleDeg: 0, stops: [] }, 20, 10)).toMatchObject({ x1: 0, y1: 5, x2: 20, y2: 5 });
    const down = gradientGeometry({ type: "linear", angleDeg: 90, stops: [] }, 20, 10);
    expect(down.type === "linear" && [Math.round(down.y1 * 1000) / 1000 + 0, Math.round(down.y2 * 1000) / 1000 + 0]).toEqual([0, 10]);
    expect(gradientGeometry({ type: "radial", angleDeg: 0, stops: [] }, 6, 8)).toMatchObject({ cx: 3, cy: 4, r: 5 });
  });

  it("pads stops to span 0–100 with no two at one place", () => {
    const stops = fullStops([{ atPct: 30, color: "#000000" }, { atPct: 30, color: "#FFFFFF" }]);
    expect(stops.map((stop) => stop.color)).toEqual(["#000000", "#000000", "#FFFFFF", "#FFFFFF"]);
    expect(new Set(stops.map((stop) => stop.atPct)).size).toBe(4);
  });

  it("caps the number of marks in a texture whatever the size", () => {
    const dots = patternCmds({ kind: "dots", color: "#000000", scaleMm: 1.5, angleDeg: 0 }, 170, 170);
    expect(dots.cmds.filter((cmd) => cmd[0] === "M").length).toBeLessThanOrEqual(3200);
    for (const kind of ["stripes", "grid", "waves"] as const) expect(patternCmds({ kind, color: "#000000", scaleMm: 3, angleDeg: 30 }, 40, 20).cmds.length).toBeGreaterThan(0);
  });
});

describe("codes and icons", () => {
  it("has 11-module symbols and a 13-module stop, and encodes with a checksum", () => {
    expect(CODE128_PATTERNS).toHaveLength(106);
    for (const pattern of CODE128_PATTERNS) expect([...pattern].reduce((sum, digit) => sum + Number(digit), 0)).toBe(11);
    const { bars, modules } = code128("SWO-0042");
    // start + 8 characters + checksum (11 each) + stop (13) + quiet zones.
    expect(modules).toBe(2 * QUIET_MODULES + 11 * 10 + 13);
    expect(bars[0]![0]).toBe(QUIET_MODULES);
    expect(code128("").modules).toBe(0);
  });

  it("puts the weighted checksum symbol just before the stop pattern", () => {
    const values = [104, ..."Wikipedia".split("").map((char) => char.charCodeAt(0) - 32)];
    expect(values.reduce((sum, value, index) => sum + value * Math.max(1, index), 0) % 103).toBe(code128CheckOf("Wikipedia"));
  });

  it("ships unique icons with path data", () => {
    expect(new Set(CARD_ICONS.map((icon) => icon.id)).size).toBe(CARD_ICONS.length);
    for (const icon of CARD_ICONS) expect(icon.d).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
    expect(cardIcon("star")?.label).toBe("Star");
  });
});

describe("text", () => {
  it("changes case", () => {
    expect(applyCase("asha menon", "title")).toBe("Asha Menon");
    expect(applyCase("Asha", "upper")).toBe("ASHA");
    expect(applyCase("Asha", "lower")).toBe("asha");
  });

  it("bends characters along the arc, centred and turned outwards", () => {
    const placed = curveGeometry({ xMm: 0, yMm: 0, wMm: 40, hMm: 10, curve: 100 }, [4, 4, 4], 3, 1);
    expect(placed[1]!.rotateDeg).toBeCloseTo(0, 5);
    expect(placed[0]!.rotateDeg).toBeLessThan(0);
    expect(placed[2]!.rotateDeg).toBeGreaterThan(0);
    const straight = curveGeometry({ xMm: 0, yMm: 0, wMm: 40, hMm: 10, curve: 0 }, [4, 4], 3, 1);
    expect(straight.map((at) => at.x)).toEqual([16, 20]);
  });
});

describe("picture crop", () => {
  it("takes the largest region of the box's shape, then zooms about the focal point", () => {
    expect(cropRegion(400, 300, 1, { zoom: 1, xPct: 50, yPct: 50 })).toEqual({ left: 50, top: 0, width: 300, height: 300 });
    expect(cropRegion(400, 300, 1, { zoom: 2, xPct: 0, yPct: 0 })).toEqual({ left: 0, top: 0, width: 150, height: 150 });
    expect(cropRegion(400, 300, 1, { zoom: 2, xPct: 100, yPct: 100 })).toEqual({ left: 250, top: 150, width: 150, height: 150 });
  });
});

function code128CheckOf(text: string) {
  // Read the checksum symbol back from the bars: the symbol before the stop pattern.
  const { bars } = code128(text);
  const symbols: string[] = [];
  let pattern = "";
  let at = QUIET_MODULES;
  for (const [start, width] of bars) {
    if (start > at) pattern += String(start - at);
    pattern += String(width);
    at = start + width;
  }
  for (let i = 0; i + 6 <= pattern.length - 7; i += 6) symbols.push(pattern.slice(i, i + 6));
  return CODE128_PATTERNS.indexOf(symbols.at(-1) as (typeof CODE128_PATTERNS)[number]);
}
