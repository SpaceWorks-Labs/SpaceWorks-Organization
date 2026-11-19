"use client";

import { useEffect, useState } from "react";
import { boxWidth } from "@/components/brand/BoxSpinner";
import { BOX_MARKUP } from "@/components/brand/boxOpen/markup";
import { BOX_CSS_HREF } from "@/components/brand/boxOpen/stylesheet";

/** Module state: the splash plays once per page load, never again on a client-side return to "/". */
let played = false;
/** The splash box height in px (the symbol at its 96 px hero size). */
const SIZE = 96;

/**
 * The cold-start splash (product rules §12.1; CR-MOTION-01's named 1600 ms box-opening exception; kit
 * motion/box-open, the `once` artwork): the box opens on the page canvas, then the layer fades away. It is CSS
 * only, so it ends without JavaScript too. It never takes pointer input (`pointer-events: none`), is hidden from
 * assistive technology, plays once per page load, and is not drawn at all under reduced motion (landing.css).
 */
export function LandingSplash() {
  const [show] = useState(() => !played);
  useEffect(() => {
    played = true;
  }, []);
  if (!show) return null;
  return (
    <div aria-hidden className="sw-splash">
      <link rel="stylesheet" href={BOX_CSS_HREF} precedence="sw-box" />
      <span
        className="sw-box once sw-splash-mark"
        style={{ width: boxWidth(SIZE), height: SIZE }}
        dangerouslySetInnerHTML={{ __html: BOX_MARKUP }}
      />
    </div>
  );
}
