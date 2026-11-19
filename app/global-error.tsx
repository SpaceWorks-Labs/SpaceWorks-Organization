"use client";

import { useEffect, useState } from "react";
import { resolvePaintedColorMode } from "@/lib/colorModeClient";
import type { PaintedColorMode } from "@/lib/colorMode";

// Rendered without the app stylesheet, so the kit's colours are explicit here: Warm Cream page and Deep Ink text in
// light, black page and Cream text in dark (CR-DARK-01), Maker Teal action with a Cream label in both.
const PALETTE = `
:root{--ge-bg:#FFF4E8;--ge-ink:#142C2A;--ge-action:#006E63;--ge-on-action:#FFF4E8;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not(.light){--ge-bg:#000000;--ge-ink:#FFF4E8;color-scheme:dark}}
:root.dark{--ge-bg:#000000;--ge-ink:#FFF4E8;color-scheme:dark}
.ge-dk{display:none}
@media (prefers-color-scheme:dark){:root:not(.light) .ge-lt{display:none}:root:not(.light) .ge-dk{display:inline-block}}
:root.dark .ge-lt{display:none}:root.dark .ge-dk{display:inline-block}`;

/**
 * The painted mode from before the error, read once in the browser: the class the boot script set on the old <html>
 * (still in the document while this first renders), else the saved choice or the device. On the server it is unknown,
 * and the stylesheet falls back to prefers-color-scheme.
 */
function initialMode(): PaintedColorMode | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.classList.contains("dark") ? "dark" : resolvePaintedColorMode();
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [mode] = useState(initialMode);
  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.error("[ui] global error", error);
    else console.error("[ui] global error");
  }, [error]);
  const logo = { width: 180, style: { height: "auto", marginBottom: "2.5rem" } };
  return (
    <html lang="en-GB" className={mode ?? undefined} suppressHydrationWarning>
      <head>
        <style>{PALETTE}</style>
      </head>
      <body style={{ margin: 0, minHeight: "100dvh", background: "var(--ge-bg)", color: "var(--ge-ink)", fontFamily: "Outfit, system-ui, sans-serif" }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "clamp(3rem, 12vh, 7rem) 1.5rem", textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the app stylesheet and image pipeline may be what failed */}
          <img src="/brand/logo/lockup-horizontal.svg" alt="Space Works" className="ge-lt" {...logo} />
          {/* eslint-disable-next-line @next/next/no-img-element -- as above; the reversed artwork for dark */}
          <img src="/brand/logo/lockup-horizontal-reversed.svg" alt="Space Works" className="ge-dk" {...logo} />
          <h1 style={{ margin: "0 0 .75rem", fontSize: 30, fontWeight: 600, lineHeight: 1.15 }}>We couldn’t load this page.</h1>
          <p style={{ margin: "0 0 1.75rem", fontSize: 17, lineHeight: 1.55 }}>Try again. If it keeps happening, let the team that runs this Space Works Organization site know.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, border: 0, borderRadius: 10, padding: ".75rem 1.25rem", color: "var(--ge-on-action)", background: "var(--ge-action)", fontSize: 16, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
