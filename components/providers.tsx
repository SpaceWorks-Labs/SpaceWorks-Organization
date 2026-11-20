"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { ToastProvider } from "@/components/feedback/ToastProvider";
import { TooltipProvider } from "@/components/ui/menu";
import { installAriaDisabledGuard } from "@/lib/ariaDisabled";
import { oppositeColorMode, type ColorMode } from "@/lib/colorMode";
import { paintColorMode, readColorMode, readPaintedColorMode, saveColorMode, watchColorMode } from "@/lib/colorModeClient";
import { switchColorMode } from "@/lib/themeTransition";

const CHANGE_EVENT = "swo:theme-change";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(CHANGE_EVENT, onStoreChange);
}

/** Tell React (and anything else listening for swo:theme-change) in the same frame the tokens change. */
function announce() {
  flushSync(() => window.dispatchEvent(new Event(CHANGE_EVENT)));
}

const ColorModeContext = createContext<{
  /** The painted mode: light or dark (owner decision 2026-11-19; there is no System). */
  mode: ColorMode;
  /** Switch to `next`, revealing it as a circle from `origin` (the control that asked). */
  setColorMode: (next: ColorMode, origin?: Element | null) => void;
  /** Flip light and dark, revealed from `origin`. */
  toggleColorMode: (origin?: Element | null) => void;
} | null>(null);

/** Tokens and React state (icons, labels) change in the same frame, inside the reveal's view transition. */
function paint(next: ColorMode) {
  saveColorMode(next);
  paintColorMode(next);
  announce();
}

export function useAppColorMode() {
  const context = useContext(ColorModeContext);
  if (!context) throw new Error("useAppColorMode must be used inside Providers.");
  return context;
}

/**
 * Light unless the person picks Dark (owner decision 2026-11-19, overriding CR-THEME-01's System option). The choice
 * lives in the swo.theme cookie, which the root layout reads to paint <html>; its boot script re-applies a saved
 * choice before first paint. Other tabs follow through the storage event. A switch plays the kit's theme reveal
 * (lib/themeTransition.ts).
 */
export function Providers({ children, initialColorMode, session }: { children: React.ReactNode; initialColorMode: ColorMode; session?: Session | null }) {
  const mode = useSyncExternalStore<ColorMode>(subscribe, readPaintedColorMode, () => initialColorMode);

  useEffect(() => {
    // Re-sync after hydration (the meta colour may have rendered after the boot script), then keep in step.
    paintColorMode(readColorMode());
    window.dispatchEvent(new Event(CHANGE_EVENT));
    const stopWatching = watchColorMode(announce);
    const stopGuard = installAriaDisabledGuard();
    return () => {
      stopWatching();
      stopGuard();
    };
  }, []);

  const colorMode = useMemo(() => {
    const setColorMode = (next: ColorMode, origin?: Element | null) => void switchColorMode(next, origin, paint);
    return { mode, setColorMode, toggleColorMode: (origin?: Element | null) => setColorMode(oppositeColorMode(mode), origin) };
  }, [mode]);

  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <ColorModeContext.Provider value={colorMode}>
        <TooltipProvider delayDuration={300}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </ColorModeContext.Provider>
    </SessionProvider>
  );
}
