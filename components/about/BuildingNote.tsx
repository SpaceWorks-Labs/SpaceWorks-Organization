"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ClosedEnvelope, ENVELOPE_RATIO, OpeningScene } from "./envelope";
import { LETTER, ReadingLetter } from "./letter";

/** How long the CSS opening in app/styles/eggs.css runs before the letter takes over. */
const OPENING_MS = 2_000;

/**
 * The team's note on the About page, ported from SpaceWorks-Events: a sealed airmail envelope that breaks
 * its seal, opens, slides out the letter and settles into a letter to read. Reduced motion goes straight
 * to the letter, and "Skip to the letter" does too.
 */
export function BuildingNote({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [width, setWidth] = useState(420);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || reading) return;
    const timer = window.setTimeout(() => setReading(true), OPENING_MS);
    return () => window.clearTimeout(timer);
  }, [open, reading]);

  useEffect(() => {
    if (reading) closeButton.current?.focus({ preventScroll: true });
  }, [reading]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setWidth(Math.min(window.innerWidth * 0.86, 420));
      setReading(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } else {
      setReading(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group relative block w-full max-w-[420px] rounded-[12px] text-left outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--sw-ui-focus))] focus-visible:ring-offset-4",
            className,
          )}
          aria-label="Open the note from the Space Works team"
        >
          <span className="block w-full" style={{ aspectRatio: ENVELOPE_RATIO }}>
            {open ? null : <ClosedEnvelope />}
          </span>
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim/48 data-[state=open]:animate-[sw-fade-in_var(--sw-dur-slow)_var(--sw-ease-enter)]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{`${LETTER.overline}: ${LETTER.title}`}</DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <button
              ref={closeButton}
              type="button"
              aria-label="Close the letter"
              className="absolute right-4 top-4 z-30 inline-flex size-11 items-center justify-center rounded-full bg-sw-cream text-sw-ink transition-colors hover:bg-[color-mix(in_srgb,var(--sw-cream)_90%,var(--sw-ink))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sw-cream"
            >
              <X className="size-5" />
            </button>
          </DialogPrimitive.Close>

          {reading ? (
            <ReadingLetter />
          ) : (
            <>
              <OpeningScene width={width} />
              <button
                type="button"
                onClick={() => setReading(true)}
                className="fixed bottom-6 left-1/2 z-30 min-h-11 -translate-x-1/2 whitespace-nowrap rounded-control bg-sw-ink px-4 py-2 text-sm font-semibold text-sw-cream underline-offset-4 hover:underline"
              >
                Skip to the letter
              </button>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
