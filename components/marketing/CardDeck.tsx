"use client";

import { useEffect, useRef, useState, type CSSProperties, type FocusEvent } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/components/motion/reducedMotion";
import type { SampleCard } from "@/lib/marketing/sampleCards";
import { CARD_DRIFT_SECONDS, cardMotion } from "./cardMotion";

/**
 * The sample cards drifting slowly sideways in a seamless loop: the set twice in one track, moved by half its width
 * with a CSS transform (components/marketing/landing.css). The second set is aria-hidden, so each card is heard
 * once. The drift starts from the first paint under `prefers-reduced-motion: no-preference` (CSS), so nothing
 * shifts when this hydrates; this only pauses it (cardMotion.ts). Under reduced motion the second set is hidden
 * and the cards stand in their still, fanned row. These are the product's own SpaceWorks samples, not a tenant's
 * cards, so the "tenant logos never animate" rule doesn't apply and they carry no data-tenant-logo.
 */
export function CardDeck({ cards }: { cards: SampleCard[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [userPaused, setUserPaused] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const motion = cardMotion({ reducedMotion, userPaused, pointerInside, focusInside, offscreen, tabHidden });

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof window.IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry?.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setTabHidden(document.visibilityState === "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const leaveFocus = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false);
  };

  const row = (copy: boolean) => (
    <ul className="sw-land-cards-row" aria-hidden={copy || undefined} data-copy={copy ? "" : undefined}>
      {cards.map((card) => (
        <li key={card.id} className="sw-land-card" data-orientation={card.orientation}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered card fronts from /public, already sized webp */}
          <img src={card.image} alt={copy ? "" : card.alt} width={card.width} height={card.height} loading="lazy" decoding="async" />
        </li>
      ))}
    </ul>
  );

  return (
    <div onFocus={() => setFocusInside(true)} onBlur={leaveFocus}>
      <div
        ref={ref}
        role="region"
        aria-label="Sample member cards"
        tabIndex={0}
        className="sw-land-cards"
        data-motion={motion}
        style={{ "--sw-card-drift": `${CARD_DRIFT_SECONDS}s` } as CSSProperties}
        onPointerEnter={() => setPointerInside(true)}
        onPointerLeave={() => setPointerInside(false)}
      >
        <div className="sw-land-cards-track">
          {row(false)}
          {row(true)}
        </div>
      </div>
      <div className="sw-land-cards-controls">
        <Button
          variant="quiet"
          size="sm"
          aria-pressed={userPaused}
          className="aria-pressed:bg-muted aria-pressed:text-ink"
          startIcon={userPaused ? <Play /> : <Pause />}
          onClick={() => setUserPaused((paused) => !paused)}
        >
          Pause motion
        </Button>
      </div>
    </div>
  );
}
