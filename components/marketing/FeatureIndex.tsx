"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The in-page area index on /features. On wide screens it sits beside the areas and marks the one being read
 * (`aria-current="location"`); on phones it is a wrapping list of links above them.
 */
export function FeatureIndex({ areas }: { areas: ReadonlyArray<{ id: string; title: string }> }) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window.IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id);
    }, { rootMargin: "-30% 0px -60% 0px" });
    for (const area of areas) {
      const node = document.getElementById(area.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [areas]);
  return (
    <nav aria-labelledby="feature-index-title" className="lg:sticky lg:top-[calc(var(--sw-land-bar)+24px)]">
      <h2 id="feature-index-title" className="mb-3 font-sans text-overline font-semibold text-ink-muted">Areas on this page</h2>
      <ul className="flex flex-wrap gap-2 lg:grid lg:gap-0.5">
        {areas.map((area) => (
          <li key={area.id}>
            <a
              href={`#${area.id}`}
              aria-current={current === area.id ? "location" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-control border border-line px-3.5 text-label font-semibold text-ink-secondary transition-colors duration-(--sw-dur-fast) hover:bg-muted hover:text-ink lg:flex lg:min-h-10 lg:border-transparent lg:px-3",
                current === area.id && "lg:bg-accent-soft lg:text-ink",
              )}
            >
              {area.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
