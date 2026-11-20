"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Which `[data-step]` child of `ref` sits across the middle of the screen. The root margin shrinks the viewport to
 * a thin band at its centre, so exactly the step being read is active. Without IntersectionObserver the first step
 * stays active and the record's own button still moves it.
 */
export function useActiveStep(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const list = ref.current;
    if (!list || typeof window.IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step ?? 0));
      }
    }, { rootMargin: "-45% 0px -45% 0px" });
    list.querySelectorAll("[data-step]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [ref]);
  return [active, setActive] as const;
}
