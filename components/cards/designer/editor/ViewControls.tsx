"use client";

import { Keyboard, Maximize, Minus as MinusIcon, Plus, ZoomIn, ZoomOut } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import type { Overlays } from "./CanvasOverlay";
import type { GuidesApi } from "./useGuides";
import type { ZoomApi } from "./useZoom";

const TOGGLES: Array<{ key: keyof Overlays; label: string }> = [
  { key: "rulers", label: "Rulers" },
  { key: "grid", label: "Grid" },
  { key: "safe", label: "Safe zone" },
  { key: "bleed", label: "Bleed" },
];

/** Zoom, the canvas overlays (rulers, grid, safe zone, bleed), guides and the shortcuts list. */
export function ViewControls({ zoom, overlays, onOverlays, guides, onHelp }: { zoom: ZoomApi; overlays: Overlays; onOverlays: (next: Overlays) => void; guides: GuidesApi; onHelp: () => void }) {
  return (
    <div role="toolbar" aria-label="View" className="flex flex-wrap items-center gap-1.5 border-b border-line bg-canvas px-3 py-1.5">
      <IconButton size="sm" label="Zoom out (Ctrl+−)" disabled={zoom.percent <= 50} onClick={zoom.zoomOut}><ZoomOut /></IconButton>
      <span className="min-w-12 text-center text-caption tabular-nums text-ink" aria-live="polite">{zoom.percent}%</span>
      <IconButton size="sm" label="Zoom in (Ctrl++)" disabled={zoom.percent >= 400} onClick={zoom.zoomIn}><ZoomIn /></IconButton>
      <IconButton size="sm" label="Fit the card (Ctrl+0)" aria-pressed={zoom.fitted} onClick={zoom.fit}><Maximize /></IconButton>
      <span aria-hidden className="mx-1 h-6 w-px bg-line" />
      {TOGGLES.map((toggle) => (
        <Button key={toggle.key} size="sm" variant={overlays[toggle.key] ? "primary" : "quiet"} aria-pressed={overlays[toggle.key]} onClick={() => onOverlays({ ...overlays, [toggle.key]: !overlays[toggle.key] })}>
          {toggle.label}
        </Button>
      ))}
      <span aria-hidden className="mx-1 h-6 w-px bg-line" />
      <IconButton size="sm" label="Add a vertical guide" onClick={() => guides.add("x")}><Plus /></IconButton>
      <IconButton size="sm" label="Add a horizontal guide" onClick={() => guides.add("y")}><MinusIcon /></IconButton>
      {guides.count ? <Button size="sm" variant="quiet" onClick={guides.clear}>Clear guides</Button> : null}
      <IconButton size="sm" label="Keyboard shortcuts (?)" className="ml-auto" onClick={onHelp}><Keyboard /></IconButton>
    </div>
  );
}
