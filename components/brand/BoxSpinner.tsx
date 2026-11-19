"use client";

import { cn } from "@/lib/cn";
import { BOX_MARKUP } from "./boxOpen/markup";
import { BOX_CSS_HREF, boxGroundColour } from "./boxOpen/stylesheet";

/** The box keeps the symbol's 136 : 126 aspect ratio; `size` is its height in px. */
export function boxWidth(size: number) {
  return Math.round((size * 136) / 126);
}

/**
 * The bare looping artwork (kit motion/box-open, the 4400ms loader loop): decorative, never focusable, and the still
 * open logo under reduced motion. `mono` draws it in the surrounding text colour (inside filled buttons), outlined in
 * the host's own background so the four shut panels stay distinct. The keyframes are a cached stylesheet resource
 * (React hoists and dedupes it); app/styles/motion-box.css lays the artwork out before it arrives.
 */
export function BoxArt({ size, mono = false, className }: { size: number; mono?: boolean; className?: string }) {
  return (
    <>
      <link rel="stylesheet" href={BOX_CSS_HREF} precedence="sw-box" />
      <span
        ref={(node) => {
          if (!node || !mono) return;
          const ground = boxGroundColour(node.parentElement);
          if (ground) node.style.setProperty("--sw-ground", ground);
        }}
        aria-hidden="true"
        className={cn("sw-box loop inline-block shrink-0 align-middle", mono && "mono", className)}
        style={{ width: boxWidth(size), height: size }}
        dangerouslySetInnerHTML={{ __html: BOX_MARKUP }}
      />
    </>
  );
}

/**
 * The inline loading state for buttons, table rows and fields: the same box as LogoLoader, 16–24px tall (20 by
 * default). A polite status announcing `label` (default "Loading"); the artwork is hidden from assistive technology.
 * In a busy button, also set `aria-busy` on the button (Button does).
 */
export function BoxSpinner({ label = "Loading", size = 20, mono = false, className }: { label?: string; size?: number; mono?: boolean; className?: string }) {
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex shrink-0 items-center align-middle", className)}>
      <BoxArt size={size} mono={mono} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
