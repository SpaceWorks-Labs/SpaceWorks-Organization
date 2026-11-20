"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { prefersReducedMotion } from "./reducedMotion";

/** A slow page shows its loading.tsx before its heading exists: look for the heading for about three seconds. */
const POLL_MS = 100;
const MAX_POLLS = 30;

/** The first mount after a hard load never animates: the browser has just painted the whole page. */
let booted = false;

function replayEnter(region: HTMLElement) {
  if (prefersReducedMotion()) return;
  region.classList.remove("sw-route-enter");
  void region.offsetWidth;
  region.classList.add("sw-route-enter");
}

/**
 * Moves focus to the new page's heading, so the next Tab starts in the content rather than on the link just pressed.
 * Leaves focus alone while a modal dialog is open or when the page has already focused something inside the region
 * (an autofocused field).
 */
function focusHeading(region: HTMLElement) {
  let polls = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = () => {
    const heading = region.querySelector<HTMLElement>("h1");
    if (!heading) {
      if (++polls < MAX_POLLS) timer = setTimeout(settle, POLL_MS);
      return;
    }
    const active = document.activeElement;
    if (document.querySelector('[aria-modal="true"], [role="dialog"][data-state="open"]')) return;
    if (active && active !== document.body && region.contains(active)) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  };
  settle();
  return () => clearTimeout(timer);
}

/**
 * The content-area route transition (kit motion/route-transition), used by each shell's template.tsx: on a real
 * pathname change the new page cross-fades in with a short upward settle (slow duration on the enter curve, after a
 * quarter of fast), and focus moves to its heading. The sidebar and top bar sit outside and stay still. Query-string
 * and hash changes (filters, tabs in the URL) are not page changes and do nothing. Reduced motion: no movement, the
 * focus move still happens.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  useLayoutEffect(() => {
    const previous = last.current;
    last.current = pathname;
    if (!booted) {
      booted = true;
      return;
    }
    const region = ref.current;
    if (!region || previous === pathname) return;
    replayEnter(region);
    return focusHeading(region);
  }, [pathname]);
  return (
    <div ref={ref} data-sw-main="" className="min-w-0">
      {children}
    </div>
  );
}
