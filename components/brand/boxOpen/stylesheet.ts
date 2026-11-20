/**
 * The box-open animation CSS (SpaceWorks-Design motion/box-open/box-open.css, copied unaltered to
 * public/brand/motion/). It is large (the flap matrices are sampled per frame), so it is a cached static file
 * loaded only where a box animates: loaders render it as a React 19 stylesheet resource, and the logo hover
 * loads it on the first hover. The small layout rules (which SVG shows, the overlay box) are in
 * app/styles/motion-box.css, so the artwork is laid out before the file arrives.
 */
export const BOX_CSS_HREF = "/brand/motion/box-open.css";

/** Hover cycle: fold shut (600ms) then open (1600ms), CR-MOTION-01's named exception. */
export const BOX_FOLD_MS = 600;
export const BOX_OPEN_MS = 1600;
export const BOX_HOVER_MS = BOX_FOLD_MS + BOX_OPEN_MS;
/** The keyframes that end the hover cycle: the released artwork and the coloured SW-412 artwork. */
export const BOX_HOVER_END = ["sw-boxh-w", "sw-box412h-w"] as const;

let loading: Promise<void> | null = null;

/** Adds the stylesheet once and resolves when it has loaded (or failed: the still logo is then all that shows). */
export function ensureBoxStylesheet(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (loading) return loading;
  const existing = document.querySelector<HTMLLinkElement>(`link[rel="stylesheet"][href="${BOX_CSS_HREF}"]`);
  if (existing?.sheet) return (loading = Promise.resolve());
  loading = new Promise<void>((resolve) => {
    const link = existing ?? document.createElement("link");
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
    if (!existing) {
      link.rel = "stylesheet";
      link.href = BOX_CSS_HREF;
      document.head.append(link);
    }
  });
  return loading;
}

/**
 * The colour behind the mark: the first opaque background up the tree. Moving flaps are outlined in it (as the
 * masters separate their parts with gaps of ground), so a sidebar or island ground shows no halo.
 */
export function boxGroundColour(start: Element | null): string | undefined {
  for (let node = start; node; node = node.parentElement) {
    const colour = getComputedStyle(node).backgroundColor;
    if (!colour || colour === "transparent") continue;
    const parts = /\(([^)]*)\)$/.exec(colour)?.[1]?.split(/[\s,/]+/).filter(Boolean) ?? [];
    if (parts.length < 4 || Number(parts[3]) >= 0.99) return colour;
  }
  return undefined;
}
