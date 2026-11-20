import { BRAND } from "@/lib/cards/palette";
import { GRADIENT_STOPS_MAX, GRADIENT_STOPS_MIN, type CardGradient } from "../layerTypes";

/* Editing a gradient's stops, for the inspector. */

/** A new gradient from the shape's fill to white. */
export const startGradient = (fill: string | null): CardGradient => ({ type: "linear", angleDeg: 0, stops: [{ atPct: 0, color: fill ?? BRAND.teal }, { atPct: 100, color: BRAND.white }] });

/** A stop between the two widest-apart neighbours, in the colour of the one before it. */
export function addStop(gradient: CardGradient): CardGradient {
  if (gradient.stops.length >= GRADIENT_STOPS_MAX) return gradient;
  const sorted = [...gradient.stops].sort((a, b) => a.atPct - b.atPct);
  let at = 1;
  for (let index = 1; index < sorted.length; index += 1) if (sorted[index]!.atPct - sorted[index - 1]!.atPct > sorted[at]!.atPct - sorted[at - 1]!.atPct) at = index;
  const stop = { atPct: Math.round((sorted[at - 1]!.atPct + sorted[at]!.atPct) / 2), color: sorted[at - 1]!.color };
  return { ...gradient, stops: [...sorted.slice(0, at), stop, ...sorted.slice(at)] };
}

export function removeStop(gradient: CardGradient, index: number): CardGradient {
  return gradient.stops.length <= GRADIENT_STOPS_MIN ? gradient : { ...gradient, stops: gradient.stops.filter((_, at) => at !== index) };
}
