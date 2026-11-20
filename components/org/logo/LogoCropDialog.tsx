"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { clampCrop, CROP_MAX_ZOOM, cropRect, minZoom, type CropImage, type CropState } from "@/lib/logo/crop";

const VIEW = 280;
const OUTPUT = 800;
const STEP = 10;

/** Draw the crop onto a square canvas and return it as a file (WebP where the browser can, else PNG). */
async function cropToFile(image: HTMLImageElement, state: CropState): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const rect = cropRect(state, { width: image.naturalWidth, height: image.naturalHeight }, VIEW, OUTPUT);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, "image/webp", 0.92);
    } catch {
      resolve(null);
    }
  });
  if (!blob) return null;
  const type = blob.type === "image/webp" ? "image/webp" : "image/png";
  return new File([blob], type === "image/webp" ? "logo.webp" : "logo.png", { type });
}

/**
 * Square crop and zoom before a logo uploads: drag the image, or focus the frame and use the arrow keys, and
 * zoom with the slider, the buttons or + and −. The frame shows exactly what will be kept.
 */
export function LogoCropDialog({ src, open, onOpenChange, onCropped }: { src: string; open: boolean; onOpenChange: (open: boolean) => void; onCropped: (file: File, previewUrl: string) => void }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; start: CropState } | null>(null);
  const [natural, setNatural] = useState<CropImage | null>(null);
  const [state, setState] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (next: CropState) => natural && setState(clampCrop(next, natural, VIEW));
  const scale = natural ? (VIEW / Math.min(natural.width, natural.height)) * state.zoom : 1;

  function onKeyDown(event: KeyboardEvent) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
    const move = moves[event.key];
    if (move) update({ ...state, x: state.x + move[0], y: state.y + move[1] });
    else if (event.key === "+" || event.key === "=") update({ ...state, zoom: state.zoom * 1.1 });
    else if (event.key === "-") update({ ...state, zoom: state.zoom / 1.1 });
    else return;
    event.preventDefault();
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: state };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    update({ ...current.start, x: current.start.x + event.clientX - current.x, y: current.start.y + event.clientY - current.y });
  }

  async function apply() {
    const image = imageRef.current;
    if (!image || !natural) return;
    setBusy(true);
    setError(null);
    try {
      const file = await cropToFile(image, state);
      if (!file) throw new Error("crop");
      onCropped(file, URL.createObjectURL(file));
      onOpenChange(false);
    } catch {
      setError("This image can't be cropped here. Upload it as it is, or choose another file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader title="Crop and zoom" description="Logos are square. Drag the image or use the arrow keys to move it; zoom out to leave room round a wide logo." />
        <DialogBody className="flex flex-col items-center gap-4">
          {error ? <Callout tone="danger" role="alert" className="w-full">{error}</Callout> : null}
          <div
            role="group"
            tabIndex={0}
            aria-label="Crop frame. Arrow keys move the image, plus and minus zoom."
            className="relative touch-none select-none overflow-hidden rounded-lg border border-line-strong bg-muted outline-offset-2 focus-visible:outline-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]"
            style={{ width: VIEW, height: VIEW, cursor: "grab" }}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL or a managed upload */}
            <img
              ref={imageRef}
              src={src}
              alt=""
              crossOrigin="anonymous"
              draggable={false}
              onLoad={(event) => {
                const image = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
                setNatural(image);
                setState(clampCrop({ zoom: 1, x: 0, y: 0 }, image, VIEW));
              }}
              onError={() => setError("This image didn't load. Choose another file.")}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={natural ? { width: natural.width * scale, height: natural.height * scale, transform: `translate(calc(-50% + ${state.x}px), calc(-50% + ${state.y}px))` } : { visibility: "hidden" }}
            />
          </div>
          <div className="flex w-full items-center gap-2">
            <IconButton label="Zoom out" disabled={!natural} onClick={() => update({ ...state, zoom: state.zoom / 1.2 })}>
              <Minus />
            </IconButton>
            <input
              type="range"
              aria-label="Zoom"
              className="min-h-11 flex-1 accent-[var(--sw-accent)]"
              min={natural ? minZoom(natural) : 1}
              max={CROP_MAX_ZOOM}
              step={0.01}
              value={state.zoom}
              disabled={!natural}
              onChange={(event) => update({ ...state, zoom: Number(event.target.value) })}
            />
            <IconButton label="Zoom in" disabled={!natural} onClick={() => update({ ...state, zoom: state.zoom * 1.2 })}>
              <Plus />
            </IconButton>
            <IconButton label="Reset crop" disabled={!natural} onClick={() => update({ zoom: 1, x: 0, y: 0 })}>
              <RotateCcw />
            </IconButton>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!natural} loading={busy} loadingLabel="Cropping" onClick={apply}>Use this crop</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
