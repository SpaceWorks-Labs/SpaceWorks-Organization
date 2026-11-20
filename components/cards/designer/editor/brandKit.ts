"use client";

import { useEffect, useState } from "react";

/** The organisation's brand kit for the card designer: logo URLs, hex colours and card font ids. */
export type BrandKit = { logos: string[]; colours: string[]; fonts: string[] };

/** Fired by the brand kit panel (components/cards/brandKit/BrandKitPanel.tsx) after a save, with the kit as detail. */
const BRAND_KIT_EVENT = "swo:card-brand-kit";

/** The kit the page loaded, then whatever the brand kit panel saves, without reloading the designer. */
export function useLiveBrandKit(initial: BrandKit | null) {
  const [kit, setKit] = useState(initial);
  useEffect(() => {
    const onSave = (event: Event) => {
      const detail = (event as CustomEvent<BrandKit>).detail;
      if (detail && Array.isArray(detail.colours)) setKit(detail);
    };
    window.addEventListener(BRAND_KIT_EVENT, onSave);
    return () => window.removeEventListener(BRAND_KIT_EVENT, onSave);
  }, []);
  return kit;
}
