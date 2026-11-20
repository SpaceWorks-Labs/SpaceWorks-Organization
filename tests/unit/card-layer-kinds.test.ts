import { describe, expect, it } from "vitest";
import { MAX_LAYERS, normalizeLayers, SHAPE_TYPES, type CardLayer } from "@/lib/cards/design/layers";
import { CARD_ICONS } from "@/lib/cards/design/icons";

/*
 * The newer layer kinds are validated strictly: essentials wrong means the layer is dropped, every
 * number is bounded, and designs saved before these kinds existed read back exactly as they were.
 */

const card = { widthMm: 85.6, heightMm: 54 };
const ART = "/api/uploads/organisations/org1/member-id-artwork/11111111-2222-4333-8444-555555555555.webp";
const one = (value: Record<string, unknown>) => normalizeLayers([{ id: "lkind1", xMm: 2, yMm: 2, wMm: 20, hMm: 10, ...value }], card)[0];

describe("older designs", () => {
  it("reads a layer saved before flips, groups and effects with every new setting off", () => {
    const text = one({ kind: "text", text: "Hi", uppercase: true }) as Extract<CardLayer, { kind: "text" }>;
    expect(text).toMatchObject({ flipX: false, flipY: false, groupId: null, textCase: "upper", uppercase: true, curve: 0, effect: "none", autoFit: false });
    const rect = one({ kind: "rect", fill: "#ff0000" }) as Extract<CardLayer, { kind: "rect" }>;
    expect(rect).toMatchObject({ fill: "#FF0000", gradient: null, pattern: null, shadow: null });
    expect(one({ kind: "line", color: "#000000" })).toMatchObject({ dash: "solid" });
    expect(one({ kind: "image", url: ART })).toMatchObject({ mask: "none", crop: { zoom: 1, xPct: 50, yPct: 50 }, adjust: { brightness: 0, contrast: 0, saturation: 0, blur: 0 }, alt: "" });
  });

  it("still reads unknown kinds as rectangles", () => {
    expect(one({ kind: "sparkle", fill: "#00FF00" })?.kind).toBe("rect");
  });

  it("allows up to the new layer limit", () => {
    expect(MAX_LAYERS).toBe(60);
    expect(normalizeLayers(Array.from({ length: 90 }, (_, i) => ({ id: `lmany${i}`, kind: "rect" })), card)).toHaveLength(60);
  });
});

describe("shapes", () => {
  it("keeps every shape type and bounds points and depth", () => {
    for (const shape of SHAPE_TYPES.filter((type) => type !== "path")) expect(one({ kind: "shape", shape, fill: "#006E63" })?.kind).toBe("shape");
    expect(one({ kind: "shape", shape: "star", points: 99, depthPct: 0 })).toMatchObject({ points: 24, depthPct: 5 });
  });

  it("drops unknown shapes and empty or unsafe custom paths", () => {
    expect(one({ kind: "shape", shape: "spiral" })).toBeUndefined();
    expect(one({ kind: "shape", shape: "path", path: "" })).toBeUndefined();
    expect(one({ kind: "shape", shape: "path", path: "M0 0 L 200 0 Z" })).toBeUndefined();
    expect(one({ kind: "shape", shape: "path", path: "M0 0 A 5 5 0 0 1 10 10" })).toBeUndefined();
    expect(one({ kind: "shape", shape: "path", path: "<script>" })).toBeUndefined();
    expect(one({ kind: "shape", shape: "path", path: `M0 0${" L50 50".repeat(250)}` })).toBeUndefined();
    expect(one({ kind: "shape", shape: "path", path: "M0 0 L100 0 L50 100 Z" })).toMatchObject({ path: "M0 0L100 0L50 100Z" });
  });

  it("validates gradients, textures and shadows", () => {
    const stops = [{ atPct: 100, color: "#ffffff" }, { atPct: 0, color: "#000000" }];
    expect(one({ kind: "rect", gradient: { type: "radial", angleDeg: 400, stops } })).toMatchObject({ gradient: { type: "radial", angleDeg: 180, stops: [{ atPct: 0, color: "#000000" }, { atPct: 100, color: "#FFFFFF" }] } });
    expect(one({ kind: "rect", gradient: { type: "linear", stops: [stops[0]] } })).toMatchObject({ gradient: null });
    expect(one({ kind: "rect", gradient: { type: "linear", stops: Array(6).fill(stops[0]) } })).toMatchObject({ gradient: null });
    expect(one({ kind: "rect", pattern: { kind: "plaid", color: "#000000" } })).toMatchObject({ pattern: null });
    expect(one({ kind: "rect", pattern: { kind: "dots", color: "#000000", scaleMm: 0.1 } })).toMatchObject({ pattern: { kind: "dots", scaleMm: 1.5 } });
    expect(one({ kind: "rect", shadow: { color: "red" } })).toMatchObject({ shadow: null });
    expect(one({ kind: "rect", shadow: { color: "#000000", dxMm: 50 } })).toMatchObject({ shadow: { dxMm: 5 } });
  });
});

describe("marks, codes and photos", () => {
  it("keeps icons from the set only", () => {
    expect(one({ kind: "icon", icon: CARD_ICONS[0]!.id })?.kind).toBe("icon");
    expect(one({ kind: "icon", icon: "not-an-icon" })).toBeUndefined();
  });

  it("bounds QR, barcode and photo settings", () => {
    expect(one({ kind: "qr", dark: "#123456", light: null })).toMatchObject({ dark: "#123456", light: null });
    expect(one({ kind: "barcode" })).toMatchObject({ color: "#000000", background: "#FFFFFF", showText: true });
    expect(one({ kind: "photo", mask: "star" })).toMatchObject({ mask: "circle", placeholder: "" });
    expect(one({ kind: "photo", mask: "hexagon", placeholder: "#abcdef" })).toMatchObject({ mask: "hexagon", placeholder: "#ABCDEF" });
  });

  it("bounds picture crop, adjustments and alt text, and still drops pictures that aren't managed uploads", () => {
    expect(one({ kind: "image", url: ART, crop: { zoom: 9, xPct: -5, yPct: 500 }, adjust: { brightness: 300, blur: 99 }, alt: "x".repeat(500), mask: "hexagon" }))
      .toMatchObject({ crop: { zoom: 5, xPct: 0, yPct: 100 }, adjust: { brightness: 100, blur: 20 }, mask: "hexagon" });
    expect((one({ kind: "image", url: ART, alt: "x".repeat(500) }) as Extract<CardLayer, { kind: "image" }>).alt).toHaveLength(200);
    expect(one({ kind: "image", url: "https://example.com/a.png" })).toBeUndefined();
  });

  it("accepts group ids and flips on every kind, and rejects malformed group ids", () => {
    expect(one({ kind: "rect", groupId: "gabc123", flipX: true })).toMatchObject({ groupId: "gabc123", flipX: true });
    expect(one({ kind: "rect", groupId: "nope" })).toMatchObject({ groupId: null });
  });

  it("bounds text effects, curve and keeps letter spacing in hundredths", () => {
    expect(one({ kind: "text", text: "A", curve: 500, effect: "glow", effectMm: 9, trackingEm: 0.08, textCase: "title" }))
      .toMatchObject({ curve: 100, effect: "none", effectMm: 3, trackingEm: 0.08, textCase: "title", uppercase: false });
  });
});
