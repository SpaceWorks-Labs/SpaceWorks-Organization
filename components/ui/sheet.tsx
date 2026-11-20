"use client";

import { type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./button";
import { BackdropDismiss, Dialog, useBackdropDismiss } from "./dialogRoot";

/** A drawer docked to one edge, or a bottom sheet on phones (kit motion/overlays). Root and trigger as for Dialog. */
export const Sheet = Dialog;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/**
 * Sheet content: slides in from `edge` over slow (240ms, enter curve) and back out over 160ms on the exit curve, with
 * the scrim fading on the same timing (`bottom` rises as a sheet instead). Reduced motion opens and closes at once.
 * Closes on Escape, the close button, or a press and release that both land on the backdrop. `title` names it for
 * assistive technology (visually hidden unless `showTitle`).
 */
export function SheetContent({
  edge = "left",
  title,
  description,
  showTitle = false,
  closeLabel = "Close",
  className,
  children,
}: {
  edge?: "left" | "right" | "bottom";
  title: ReactNode;
  description?: ReactNode;
  showTitle?: boolean;
  closeLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const backdrop = useBackdropDismiss();
  return (
    <DialogPrimitive.Portal>
      <BackdropDismiss className="sw-fx-scrim fixed inset-0 z-50 bg-scrim/48" />
      <DialogPrimitive.Content
        data-edge={edge}
        onPointerDownOutside={(event) => {
          if (backdrop) event.preventDefault();
        }}
        className={cn(
          "fixed z-50 overflow-y-auto border-line bg-panel text-ink shadow-float focus:outline-none",
          edge === "bottom"
            ? "sw-fx-sheet inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]"
            : cn("sw-fx-drawer inset-y-0 w-[min(320px,86vw)]", edge === "left" ? "left-0 border-r" : "right-0 border-l"),
          className,
        )}
      >
        <DialogPrimitive.Title className={showTitle ? "px-5 pt-5 text-h3 text-ink" : "sr-only"}>{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{description ?? title}</DialogPrimitive.Description>
        <DialogPrimitive.Close asChild>
          <IconButton label={closeLabel} size="sm" className="absolute right-3 top-3 z-10">
            <X />
          </IconButton>
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
