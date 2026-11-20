"use client";

import { useEffect, useRef, useState } from "react";
import { boxWidth } from "@/components/brand/BoxSpinner";
import { BOX_MARKUP } from "@/components/brand/boxOpen/markup";
import { BOX_CSS_HREF } from "@/components/brand/boxOpen/stylesheet";
import { flySplash } from "./splashFlight";

/** Module state: the splash plays once per page load, never again on a client-side return to "/". */
let played = false;
/** The one ending per page load, shared if the effect runs twice (React's development double mount). */
let ending: Promise<boolean> | null = null;
/** The splash box height in px (the symbol at its 96 px hero size). */
const SIZE = 96;

/**
 * The cold-start splash (product rules §12.1; CR-MOTION-01's named 1600 ms box-opening exception; kit
 * motion/box-open, the `once` artwork): the box opens on the page canvas, then flies into the header's Space Works
 * mark while the canvas fades (splashFlight.ts), or fades in place when there is no mark to land on. Without
 * JavaScript the CSS fade ends it. It never takes pointer input (`pointer-events: none`), is hidden from assistive
 * technology, plays once per page load, and is not drawn at all under reduced motion (landing.css).
 */
export function LandingSplash() {
  const [show, setShow] = useState(() => !played);
  const root = useRef<HTMLDivElement>(null);
  const ground = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    played = true;
    if (!root.current || !ground.current || !mark.current) return;
    let mounted = true;
    ending ??= flySplash(root.current, ground.current, mark.current);
    void ending.then((done) => {
      if (done && mounted) setShow(false);
    });
    return () => {
      mounted = false;
    };
  }, []);
  if (!show) return null;
  return (
    <div ref={root} aria-hidden className="sw-splash">
      <link rel="stylesheet" href={BOX_CSS_HREF} precedence="sw-box" />
      <div ref={ground} className="sw-splash-ground" />
      <span
        ref={mark}
        className="sw-box once sw-splash-mark"
        style={{ width: boxWidth(SIZE), height: SIZE }}
        dangerouslySetInnerHTML={{ __html: BOX_MARKUP }}
      />
    </div>
  );
}
