"use client";

import { useEffect, useRef, type ReactNode } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Reveal on scroll for public pages (the kit's scroll-reveal template, CR-MOTION-01): every `[data-reveal]` inside
 * fades and rises once, the first time its top crosses the lower eighth of the screen (640ms on the enter curve,
 * app/styles/motion-route.css), and is never watched again. The hiding CSS applies only under `[data-reveal-ready]`,
 * set here, so without JavaScript, without IntersectionObserver or under reduced motion everything simply shows.
 * A block holding a tenant logo never moves (tenant logos stay still).
 */
export function RevealRoot({ className, children }: { className?: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node || typeof window.IntersectionObserver !== "function" || typeof window.matchMedia !== "function") return;
    if (window.matchMedia(REDUCED).matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-revealed", "");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -12% 0px" });
    node.querySelectorAll("[data-reveal]").forEach((item) => observer.observe(item));
    node.setAttribute("data-reveal-ready", "");
    return () => {
      observer.disconnect();
      node.removeAttribute("data-reveal-ready");
    };
  }, []);
  return <div ref={root} className={className}>{children}</div>;
}
