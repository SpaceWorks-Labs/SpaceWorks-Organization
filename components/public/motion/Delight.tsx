"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Playful touches for one organisation's pages (Organisation.delightEnabled, CR-MOTION-01): on by default,
 * with the organisation's opt-out in Settings. Platform pages (the directory) have no scope and stay on.
 * Reduced motion always wins: every delight animation sits behind `prefers-reduced-motion: no-preference`
 * in motion.module.css, so the class can be rendered on the server and the first paint is already right.
 */
const DelightContext = createContext(true);

export function DelightScope({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <DelightContext.Provider value={enabled}>{children}</DelightContext.Provider>;
}

/** Whether this organisation still shows playful touches. Pair it with CSS that honours reduced motion. */
export function useDelight() {
  return useContext(DelightContext);
}
