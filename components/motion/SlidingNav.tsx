"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";
import { useSlideIndicator } from "./useSlideIndicator";

/**
 * A navigation list whose current item's fill is one box that slides between items (CR-SIDEBAR-01 current item, kit
 * motion/sidebar). Give each item `sw-slide-item` and `aria-current="page"` when current; once the box is placed the
 * item's own fill steps aside (app/styles/motion-route.css). Transform only, base duration; instant under reduced
 * motion and on first paint.
 */
export function SlidingNav({ className, children, ...props }: ComponentPropsWithoutRef<"nav">) {
  const nav = useRef<HTMLElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  useSlideIndicator(nav, bar, 'a.sw-slide-item[aria-current="page"]');
  return (
    <nav ref={nav} className={cn("relative", className)} {...props}>
      <span ref={bar} aria-hidden className="sw-indicator sw-nav-indicator" />
      {children}
    </nav>
  );
}
