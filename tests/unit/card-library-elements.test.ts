import { describe, expect, it } from "vitest";
import { normalizeLayers } from "@/lib/cards/design/layers";
import { GROUP_ID_PATTERN, LAYER_ID_PATTERN, LAYER_KINDS, MAX_LAYERS, type CardLayer } from "@/lib/cards/design/layerTypes";
import { imageElement, libraryContext, type LibraryContext } from "@/lib/cards/design/library/base";
import { fits, iconElement, LIBRARY, matchesQuery, searchLibrary } from "@/lib/cards/design/library/catalog";
import { placeholderOptions } from "@/lib/cards/design/library/placeholders";
import { defaultCardSideSettings } from "@/lib/cards/design/normalize";

const context = { organisationName: "Example", planName: "Life" };
const base = defaultCardSideSettings(context);
const landscape = libraryContext({ ...base, widthMm: 85.6, heightMm: 54 });
const portrait = libraryContext({ ...base, widthMm: 54, heightMm: 85.6 });
const branded = libraryContext({ ...base, widthMm: 85.6, heightMm: 54 }, ["#123abc", "#ff0000", "not a colour", "#00ff00"]);
const items = LIBRARY.flatMap((category) => category.items);

const HEX = /^#[0-9A-F]{6}$/;
const rounded = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;

/** Every colour string anywhere in the layer. */
function colours(value: unknown): string[] {
  if (typeof value === "string") return value.startsWith("#") ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(colours);
  if (value && typeof value === "object") return Object.values(value).flatMap(colours);
  return [];
}

function check(layers: CardLayer[], ctx: LibraryContext) {
  expect(layers.length).toBeGreaterThan(0);
  expect(new Set(layers.map((layer) => layer.id)).size).toBe(layers.length);
  for (const layer of layers) {
    expect(layer.id).toMatch(LAYER_ID_PATTERN);
    expect(LAYER_KINDS).toContain(layer.kind);
    for (const key of ["xMm", "yMm", "wMm", "hMm"] as const) expect(rounded(layer[key]), `${layer.name} ${key}`).toBe(true);
    expect(layer.xMm).toBeGreaterThanOrEqual(0);
    expect(layer.yMm).toBeGreaterThanOrEqual(0);
    expect(layer.xMm + layer.wMm).toBeLessThanOrEqual(ctx.widthMm + 0.05);
    expect(layer.yMm + layer.hMm).toBeLessThanOrEqual(ctx.heightMm + 0.05);
    for (const colour of colours(layer)) expect(colour).toMatch(HEX);
  }
  if (layers.length > 1) {
    expect(layers[0]!.groupId).toMatch(GROUP_ID_PATTERN);
    expect(new Set(layers.map((layer) => layer.groupId)).size).toBe(1);
  } else {
    expect(layers[0]!.groupId).toBeNull();
  }
}

describe("card element library", () => {
  it("names every category and element once, in sentence case", () => {
    expect(new Set(LIBRARY.map((category) => category.id)).size).toBe(LIBRARY.length);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.label)).size).toBe(items.length);
    for (const label of [...LIBRARY.map((category) => category.label), ...items.map((item) => item.label)]) {
      expect(label[0]).toBe(label[0]!.toUpperCase());
      expect(label.slice(1)).not.toMatch(/\b[A-Z][a-z]/);
    }
  });

  it("makes complete layers that stay on the card, in both orientations", () => {
    for (const ctx of [landscape, portrait, branded]) for (const item of items) check(item.make(ctx), ctx);
  });

  it("makes layers that normalising leaves exactly as they are", () => {
    for (const ctx of [landscape, portrait]) {
      for (const item of items) {
        const layers = item.make(ctx);
        expect(normalizeLayers(layers, ctx), item.id).toEqual(layers);
      }
    }
  });

  it("gives every element new ids, never one the side already uses", () => {
    const first = items.flatMap((item) => item.make(landscape));
    const taken = libraryContext({ ...base, layers: first });
    const again = items.flatMap((item) => item.make(taken));
    expect(again.some((layer) => first.some((old) => old.id === layer.id))).toBe(false);
  });

  it("covers every category the designer offers", () => {
    expect(LIBRARY.map((category) => category.label)).toEqual(["Shapes", "Bands and borders", "Badges and stickers", "Dividers", "QR and barcode", "Photo frames", "Text styles", "Gradients", "Patterns"]);
    const kinds = new Set(items.flatMap((item) => item.make(landscape)).map((layer) => layer.kind));
    for (const kind of ["text", "rect", "ellipse", "line", "shape", "qr", "barcode", "photo"]) expect(kinds).toContain(kind);
    expect(iconElement(landscape, "star", "Star")[0]).toMatchObject({ kind: "icon", icon: "star", name: "Star", color: landscape.colours.primary });
  });

  it("uses the brand kit's colours first, ignoring anything that isn't a colour", () => {
    expect(branded.colours).toMatchObject({ primary: "#123ABC", secondary: "#FF0000", tertiary: "#00FF00" });
    const square = items.find((item) => item.id === "rect")!.make(branded)[0]!;
    expect(square).toMatchObject({ kind: "rect", fill: "#123ABC" });
    expect(landscape.colours.primary).toMatch(HEX);
  });
});

describe("card element library bands and corners", () => {
  const band = (id: string, ctx = landscape) => items.find((item) => item.id === id)!.make(ctx)[0]!;

  it("pairs every top band with a bottom one: the same shape at the foot, flipped top to bottom", () => {
    const tops = items.filter((item) => /^band-.*-top$/.test(item.id));
    expect(tops.length).toBe(7);
    for (const top of tops) {
      for (const ctx of [landscape, portrait]) {
        const upper = band(top.id, ctx);
        const lower = band(top.id.replace(/-top$/, "-bottom"), ctx);
        expect(upper.flipY).toBe(false);
        expect(lower.flipY).toBe(true);
        expect(lower.kind).toBe(upper.kind);
        if (upper.kind === "shape" && lower.kind === "shape") expect(lower.shape).toBe(upper.shape);
        expect(lower.hMm).toBe(upper.hMm);
        expect(upper.yMm).toBeLessThan(ctx.heightMm / 4);
        expect(lower.yMm + lower.hMm).toBeGreaterThan(ctx.heightMm * 0.9);
      }
    }
    expect(band("band-wave-top")).toMatchObject({ kind: "shape", shape: "waveBand", xMm: 0, yMm: 0, wMm: 85.6 });
  });

  it("flips one corner shape into each corner", () => {
    expect(band("corner-top-left")).toMatchObject({ xMm: 0, yMm: 0, flipX: false, flipY: false });
    expect(band("corner-top-right")).toMatchObject({ yMm: 0, flipX: true, flipY: false });
    expect(band("corner-bottom-left")).toMatchObject({ xMm: 0, flipX: false, flipY: true });
    const corner = band("cornerRound-bottom-right");
    expect(corner).toMatchObject({ shape: "cornerRound", flipX: true, flipY: true });
    expect(corner.xMm + corner.wMm).toBeCloseTo(85.6, 1);
  });

  it("draws borders as rounded frames round the card", () => {
    expect(band("frame-edge")).toMatchObject({ kind: "shape", shape: "frame", xMm: 0, yMm: 0, wMm: 85.6, hMm: 54, radiusMm: 3 });
    const strips = ["strip-left", "strip-right"].map((id) => band(id));
    expect(strips[0]).toMatchObject({ xMm: 0, hMm: 54 });
    expect(strips[1]!.xMm + strips[1]!.wMm).toBeCloseTo(85.6, 1);
  });
});

describe("card element library helpers", () => {
  it("keeps an uploaded picture's proportions and places it on the card", () => {
    const [wide] = imageElement(landscape, "/uploads/organisations/o1/member-id-artwork/a.png", 2);
    expect(wide).toMatchObject({ kind: "image", fit: "cover", mask: "none", alt: "", groupId: null });
    expect(wide!.wMm / wide!.hMm).toBeCloseTo(2, 1);
    const [tall] = imageElement(landscape, "/uploads/organisations/o1/member-id-artwork/a.png", 0.25);
    expect(tall!.hMm).toBeLessThanOrEqual(54 * 0.6 + 0.05);
    expect(tall!.wMm / tall!.hMm).toBeCloseTo(0.25, 1);
  });

  it("searches labels and keywords, every word counting", () => {
    expect(searchLibrary("")).toEqual([]);
    expect(searchLibrary("bottom wave").map((item) => item.id)).toEqual(["band-wave-bottom"]);
    expect(searchLibrary("footer").every((item) => item.id.endsWith("-bottom"))).toBe(true);
    expect(matchesQuery("Hex", "Hexagon")).toBe(true);
    expect(fits(MAX_LAYERS - 2, 2)).toBe(true);
    expect(fits(MAX_LAYERS - 1, 2)).toBe(false);
  });

  it("offers placeholders named after the organisation's levels", () => {
    const keys = (levels?: readonly string[]) => placeholderOptions(levels).map((option) => option.key);
    expect(placeholderOptions(["Area", "Unit"]).filter((option) => option.key.startsWith("level"))).toEqual([{ key: "level1", label: "Area" }, { key: "level2", label: "Unit" }]);
    expect(keys([])).not.toContain("unit");
    expect(keys([])).not.toContain("level1");
    expect(keys(undefined)).toContain("level4");
    expect(placeholderOptions(undefined).find((option) => option.key === "contact")?.label).toBe("Contact details");
  });
});
