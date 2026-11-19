// Plain values shared by server and client chart components (a "use client" module would hand server
// components a client reference instead of the function).

/** Series slots stop at five (CR-CHART-01); fold the rest into "Other" (muted). Danger is never a series. */
export const MAX_SERIES_SLOT = 5;

/** CSS variable for a categorical slot (1–5) or the de-emphasis grey. */
export function slotColor(slot: number | "muted"): string {
  return slot === "muted" ? "var(--chart-muted)" : `var(--chart-${Math.min(MAX_SERIES_SLOT, Math.max(1, Math.round(slot)))})`;
}
