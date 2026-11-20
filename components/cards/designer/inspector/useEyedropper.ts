"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/*
 * Picking a colour from the screen. Browsers with the EyeDropper API (Chrome, Edge) pick from
 * anywhere. Elsewhere the next click on the card preview (`[data-active-card]`) takes the colour of
 * what was clicked, as the page draws it (its fill, background or text colour); Escape or a click
 * anywhere else cancels.
 */

type EyeDropperResult = { sRGBHex: string };
type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> };

/** `#RRGGBB` from a CSS colour the browser computed (`rgb(…)`, `rgba(…)`, `#rrggbb`); null when transparent or unknown. */
export function cssColourToHex(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
  const match = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(trimmed);
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? Number.parseFloat(match[4]) / 100 : Number(match[4]);
  if (alpha === 0) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Math.round(Number(part)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** The colour the page draws at `element`: an SVG fill, else a background, else a text colour; walking up to the card. */
function colourAt(element: Element | null): string | null {
  for (let node = element; node && !node.matches("[data-active-card]"); node = node.parentElement) {
    const style = getComputedStyle(node);
    const own = node instanceof SVGElement ? cssColourToHex(style.fill) ?? cssColourToHex(style.stroke) : cssColourToHex(style.backgroundColor);
    if (own) return own;
    if (!(node instanceof SVGElement) && node.childNodes.length && [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())) return cssColourToHex(style.color);
  }
  return null;
}

const subscribe = () => () => {};

export function useEyedropper(onPick: (hex: string) => void) {
  const native = useSyncExternalStore(subscribe, () => "EyeDropper" in window, () => false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!picking || native) return;
    const finish = () => setPicking(false);
    const onPointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("[data-active-card]")) return finish();
      event.preventDefault();
      event.stopPropagation();
      const hex = colourAt(target);
      if (hex) onPick(hex);
      finish();
    };
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-active-card]")) event.stopPropagation();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [picking, native, onPick]);

  const pick = async () => {
    if (!native) return setPicking((value) => !value);
    try {
      const EyeDropper = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper;
      const hex = cssColourToHex((await new EyeDropper().open()).sRGBHex);
      if (hex) onPick(hex);
    } catch {
      // Escape closes the native picker without a colour.
    }
  };

  return { pick, picking };
}
