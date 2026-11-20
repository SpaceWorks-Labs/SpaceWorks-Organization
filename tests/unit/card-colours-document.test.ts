import { describe, expect, it } from "vitest";
import { LAYER_DEFAULTS, NO_ADJUST, NO_CROP, PAINT_DEFAULTS, TEXT_DEFAULTS, type CardLayer } from "@/lib/cards/design/layerTypes";
import { documentColours, mapLayerColours, replaceColour } from "@/lib/cards/design/library/colours";
import { addStop, removeStop, startGradient } from "@/lib/cards/design/library/paint";
import { defaultCardSideSettings } from "@/lib/cards/design/normalize";

const context = { organisationName: "Example", planName: "Life" };
const box = { xMm: 1, yMm: 1, wMm: 10, hMm: 10 };
const at = (id: string) => ({ ...LAYER_DEFAULTS, ...box, id });

/** One layer of every kind, every colour field set to a colour of its own (lower case, to test matching). */
function everyKind(tag: string): CardLayer[] {
  const c = (n: number) => `#${tag}${String(n).padStart(4, "0")}`;
  return [
    { ...at(`lt${tag}1`), ...TEXT_DEFAULTS, kind: "text", text: "Hi", font: "gilroy", sizePt: 10, color: c(1), effect: "outline", effectColor: c(2) },
    { ...at(`lr${tag}1`), ...PAINT_DEFAULTS, kind: "rect", radiusMm: 0, fill: c(3), stroke: c(4), gradient: { type: "linear", angleDeg: 0, stops: [{ atPct: 0, color: c(5) }, { atPct: 100, color: c(6) }] }, pattern: { kind: "dots", color: c(7), scaleMm: 3, angleDeg: 0 }, shadow: { color: c(8), dxMm: 1, dyMm: 1, opacityPct: 50 } },
    { ...at(`ls${tag}1`), ...PAINT_DEFAULTS, kind: "shape", shape: "star", points: 5, depthPct: 50, radiusMm: 0, path: "", fill: c(9), stroke: null },
    { ...at(`li${tag}1`), kind: "image", url: "/uploads/organisations/o/member-id-artwork/a.png", fit: "cover", radiusMm: 0, grayscale: false, mask: "none", crop: NO_CROP, adjust: NO_ADJUST, shadow: { color: c(10), dxMm: 1, dyMm: 1, opacityPct: 50 }, alt: "" },
    { ...at(`ll${tag}1`), kind: "line", color: c(11), dash: "solid" },
    { ...at(`lc${tag}1`), kind: "icon", icon: "star", color: c(12), strokeMm: 0.4 },
    { ...at(`lq${tag}1`), kind: "qr", dark: c(13), light: c(14) },
    { ...at(`lb${tag}1`), kind: "barcode", color: c(15), background: c(16), showText: true },
    { ...at(`lp${tag}1`), kind: "photo", mask: "circle", stroke: c(17), strokeMm: 0.8, placeholder: "" },
  ];
}
const FIELDS = 17;

function design() {
  const side = defaultCardSideSettings(context);
  return {
    front: { ...side, backgroundColor: "custom" as const, accentColor: "custom" as const, customColours: { background: "#CC0001", accent: "#CC0002", text: "#CC0003" }, layers: everyKind("aa") },
    back: { ...side, layers: everyKind("bb") },
  };
}

describe("card document colours", () => {
  it("lists every colour the design shows, front then back, in capitals, once each", () => {
    const listed = documentColours(design());
    const layerColours = (tag: string) => Array.from({ length: FIELDS }, (_, n) => `#${tag.toUpperCase()}${String(n + 1).padStart(4, "0")}`);
    // The rectangle's fill is hidden under its gradient.
    const visible = (tag: string) => layerColours(tag).filter((hex) => !hex.endsWith("0003"));
    expect(listed.slice(0, 2)).toEqual(["#CC0001", "#CC0002"]);
    expect([...listed].sort()).toEqual(["#CC0001", "#CC0002", ...visible("aa"), ...visible("bb")].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("leaves out colours that don't show: a text effect that is off, an unused custom colour", () => {
    const base = design();
    const text = { ...base.front.layers[0]!, effect: "none" } as CardLayer;
    const listed = documentColours({ ...base, front: { ...base.front, layers: [text] } });
    expect(listed).toContain("#AA0001");
    expect(listed).not.toContain("#AA0002");
    expect(listed).toContain("#CC0002");
    expect(listed).not.toContain("#CC0003");
    const plain = documentColours({ front: { ...base.front, layers: [text], backgroundColor: "white", accentColor: "teal" }, back: { ...base.back, layers: [] } });
    expect(plain).toEqual(["#AA0001"]);
  });

  it("replaces a colour in every field on both sides, matching any case", () => {
    const base = design();
    const replaced = (from: string) => replaceColour(base, from, "#00ff00");
    for (const tag of ["aa", "bb"]) {
      for (let n = 1; n <= FIELDS; n += 1) {
        const from = `#${tag}${String(n).padStart(4, "0")}`;
        const next = replaced(from.toUpperCase());
        const side = tag === "aa" ? next.front : next.back;
        const found: string[] = [];
        side.layers.forEach((layer) => mapLayerColours(layer, (hex) => (found.push(hex), hex)));
        expect(found, from).toContain("#00FF00");
        expect(found.some((hex) => hex.toLowerCase() === from)).toBe(false);
      }
    }
    const custom = replaceColour(base, "#cc0003", "#123456");
    expect(custom.front.customColours).toEqual({ background: "#CC0001", accent: "#CC0002", text: "#123456" });
    expect(replaceColour(base, "#ABCDEF", "#000000")).toEqual(base);
  });
});

describe("card gradient stops", () => {
  it("adds stops between the widest gap up to five and removes them down to two", () => {
    let gradient = startGradient("#006E63");
    expect(gradient.stops).toEqual([{ atPct: 0, color: "#006E63" }, { atPct: 100, color: "#FFFFFF" }]);
    gradient = addStop(gradient);
    expect(gradient.stops.map((stop) => stop.atPct)).toEqual([0, 50, 100]);
    gradient = addStop(addStop(addStop(gradient)));
    expect(gradient.stops).toHaveLength(5);
    expect(new Set(gradient.stops.map((stop) => stop.atPct)).size).toBe(5);
    let shrinking = gradient;
    for (let n = 0; n < 5; n += 1) shrinking = removeStop(shrinking, 0);
    expect(shrinking.stops).toHaveLength(2);
  });
});
