import { describe, expect, it } from "vitest";
import { C, KEYBOARD, TARGET, type ControlInput } from "@/components/cards/designer/inspector/inspectorControls";
import { cssColourToHex } from "@/components/cards/designer/inspector/useEyedropper";

describe("card inspector controls", () => {
  const controls = Object.entries(C);

  it("gives every control a unique, sentence-case accessible name", () => {
    expect(new Set(controls.map(([, control]) => control.label)).size).toBe(controls.length);
    for (const [, control] of controls) {
      expect(control.label.trim()).not.toBe("");
      expect(control.label[0]).toBe(control.label[0]!.toUpperCase());
      expect(control.label.slice(1)).not.toMatch(/\b[A-Z][a-z]/);
      expect(control.label).not.toMatch(/[!:]$/);
    }
  });

  it("reaches every control from the keyboard and makes it a 44px target", () => {
    const inputs = new Set(controls.map(([, control]) => control.input));
    for (const input of inputs) {
      expect(KEYBOARD[input as ControlInput]).toMatch(/\w/);
      expect(TARGET[input as ControlInput]).toMatch(/(min-h|size)-11\b/);
    }
    expect(Object.keys(KEYBOARD).sort()).toEqual(Object.keys(TARGET).sort());
  });

  it("covers every layer kind's settings", () => {
    for (const id of ["font", "textCase", "curve", "effect", "autoFit", "gradient", "addStop", "removeStop", "pattern", "shadow", "radius", "points", "depth", "dash", "icon", "qrDark", "qrLight", "barcodeText", "photoMask", "ring", "zoom", "focusX", "focusY", "mask", "brightness", "blur", "alt", "replace", "opacity", "replaceColour"]) {
      expect(C, id).toHaveProperty(id);
    }
  });
});

describe("card colour picking from the screen", () => {
  it("reads the colours browsers compute", () => {
    expect(cssColourToHex("rgb(0, 110, 99)")).toBe("#006E63");
    expect(cssColourToHex("rgba(255, 116, 71, 0.5)")).toBe("#FF7447");
    expect(cssColourToHex("rgb(20 44 42 / 100%)")).toBe("#142C2A");
    expect(cssColourToHex("#dfff8f")).toBe("#DFFF8F");
    expect(cssColourToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(cssColourToHex("none")).toBeNull();
    expect(cssColourToHex("url(#gradient)")).toBeNull();
  });
});
