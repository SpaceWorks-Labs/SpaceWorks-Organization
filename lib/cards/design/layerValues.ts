import { managedImageUrl } from "@/lib/cards/imageUrl";
import { clamp, round1 } from "./elements";
import { GRADIENT_STOPS_MAX, GRADIENT_STOPS_MIN, PATTERN_KINDS, type CardGradient, type CardPattern, type CardShadow } from "./layerTypes";

/*
 * Small, strict readers for stored layer values: every number is bounded and rounded, every choice
 * comes from a fixed list, and anything else falls back to a default (or null for optional parts).
 */

const HEX_COLOUR = /^#[0-9A-F]{6}$/;

export const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

export const num = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? round1(clamp(n, min, max)) : fallback;
};

export const int = (value: unknown, min: number, max: number, fallback: number) => Math.round(num(value, min, max, fallback));

export const bool = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);

export const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(value as string) ? (value as T) : fallback);

export const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

export function hexColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return HEX_COLOUR.test(upper) ? upper : null;
}

/** Card artwork must be a managed upload. Organisation checks happen in `scopeCardArtwork`. */
export function artworkUrl(value: unknown) {
  return typeof value === "string" && /\/member-id-artwork\//.test(value) ? managedImageUrl(value) : null;
}

/** A gradient with 2–5 valid stops in order, or null. */
export function gradient(value: unknown): CardGradient | null {
  const input = record(value);
  if (!input || !Array.isArray(input.stops)) return null;
  const stops = input.stops.flatMap((item) => {
    const stop = record(item);
    const color = hexColour(stop?.color);
    return stop && color ? [{ atPct: int(stop.atPct, 0, 100, 0), color }] : [];
  });
  if (stops.length < GRADIENT_STOPS_MIN || stops.length > GRADIENT_STOPS_MAX) return null;
  stops.sort((a, b) => a.atPct - b.atPct);
  return { type: oneOf(input.type, ["linear", "radial"] as const, "linear"), angleDeg: int(input.angleDeg, -180, 180, 90), stops };
}

export function pattern(value: unknown): CardPattern | null {
  const input = record(value);
  const color = hexColour(input?.color);
  if (!input || !color || !(PATTERN_KINDS as readonly string[]).includes(input.kind as string)) return null;
  return { kind: input.kind as CardPattern["kind"], color, scaleMm: num(input.scaleMm, 1.5, 20, 3), angleDeg: int(input.angleDeg, -90, 90, 0) };
}

export function shadow(value: unknown): CardShadow | null {
  const input = record(value);
  const color = hexColour(input?.color);
  if (!input || !color) return null;
  return { color, dxMm: num(input.dxMm, -5, 5, 0.6), dyMm: num(input.dyMm, -5, 5, 0.6), opacityPct: int(input.opacityPct, 0, 100, 35) };
}
