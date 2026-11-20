/*
 * Every control of the layer inspector with its accessible name, how it is reached from the keyboard
 * and the class that makes it a 44px target, in one list so the inspector and its accessibility test
 * read the same words. Colour fields name their swatch groups "<label>: brand colours" and so on.
 */

export type ControlInput = "slider" | "choice" | "switch" | "colour" | "text" | "button" | "picker" | "file";

/** How each kind of control works from the keyboard alone. */
export const KEYBOARD: Record<ControlInput, string> = {
  slider: "Arrow keys, Page Up, Page Down, Home and End move the slider; the number box takes a typed value",
  choice: "Tab to an option; Enter or Space chooses it",
  switch: "Tab to the switch; Space turns it on or off",
  colour: "Tab to a swatch; Enter or Space chooses it; the colour picker takes a typed hex value",
  text: "Tab to the box and type",
  button: "Tab to the button; Enter or Space presses it",
  picker: "Enter opens the list; Tab and Enter choose; Escape closes it",
  file: "Enter opens the file chooser",
};

/** The class that gives each kind of control its 44px target. */
export const TARGET: Record<ControlInput, string> = {
  slider: "min-h-11",
  choice: "min-h-11",
  switch: "min-h-11",
  colour: "size-11",
  text: "min-h-11",
  button: "min-h-11",
  picker: "min-h-11",
  file: "file:min-h-11",
};

const control = (label: string, input: ControlInput) => ({ label, input });

export const C = {
  name: control("Layer name", "text"),
  opacity: control("Opacity", "slider"),
  // Text
  text: control("Text", "text"),
  placeholder: control("Insert a placeholder", "button"),
  font: control("Font", "picker"),
  size: control("Text size", "slider"),
  bold: control("Bold", "switch"),
  textCase: control("Letter case", "choice"),
  align: control("Alignment", "choice"),
  textColour: control("Text colour", "colour"),
  tracking: control("Letter spacing", "slider"),
  lineHeight: control("Line height", "slider"),
  curve: control("Curve", "slider"),
  effect: control("Effect", "choice"),
  effectColour: control("Effect colour", "colour"),
  effectWidth: control("Effect size", "slider"),
  autoFit: control("Shrink to fit the box", "switch"),
  // Shapes
  fill: control("Fill", "colour"),
  gradient: control("Gradient", "switch"),
  gradientType: control("Gradient type", "choice"),
  gradientAngle: control("Gradient angle", "slider"),
  stopColour: control("Stop colour", "picker"),
  stopAt: control("Stop position", "slider"),
  addStop: control("Add a colour stop", "button"),
  removeStop: control("Remove this stop", "button"),
  pattern: control("Pattern", "choice"),
  patternColour: control("Pattern colour", "colour"),
  patternScale: control("Pattern size", "slider"),
  patternAngle: control("Pattern angle", "slider"),
  outline: control("Outline", "colour"),
  outlineWidth: control("Outline width", "slider"),
  radius: control("Corner rounding", "slider"),
  points: control("Points", "slider"),
  depth: control("Depth", "slider"),
  shadow: control("Shadow", "switch"),
  shadowColour: control("Shadow colour", "colour"),
  shadowX: control("Shadow across", "slider"),
  shadowY: control("Shadow down", "slider"),
  shadowOpacity: control("Shadow strength", "slider"),
  // Lines, icons, codes, photos
  lineColour: control("Line colour", "colour"),
  thickness: control("Thickness", "slider"),
  dash: control("Line style", "choice"),
  icon: control("Icon", "picker"),
  iconColour: control("Icon colour", "colour"),
  iconStroke: control("Stroke width", "slider"),
  qrDark: control("Code colour", "colour"),
  qrLight: control("Code background", "colour"),
  barcodeColour: control("Bar colour", "colour"),
  barcodeBackground: control("Barcode background", "colour"),
  barcodeText: control("Show the number", "switch"),
  photoMask: control("Photo shape", "choice"),
  ring: control("Ring", "colour"),
  ringWidth: control("Ring width", "slider"),
  photoPlaceholder: control("Text when there is no photo", "text"),
  // Images
  fit: control("Fit", "choice"),
  zoom: control("Crop zoom", "slider"),
  focusX: control("Crop across", "slider"),
  focusY: control("Crop down", "slider"),
  mask: control("Mask", "choice"),
  grayscale: control("Black and white", "switch"),
  brightness: control("Brightness", "slider"),
  contrast: control("Contrast", "slider"),
  saturation: control("Saturation", "slider"),
  blur: control("Blur", "slider"),
  resetAdjust: control("Reset adjustments", "button"),
  replace: control("Replace the image", "file"),
  alt: control("Description for screen readers", "text"),
  // Design colours
  replaceColour: control("Replace colour", "picker"),
} as const;

export type ControlId = keyof typeof C;
