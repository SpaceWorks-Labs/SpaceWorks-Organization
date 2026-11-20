"use client";

import { createContext, useCallback, useContext, useRef, useState, type ComponentProps } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

const DismissContext = createContext<(() => void) | null>(null);

/**
 * Radix Dialog root that also hands its close to BackdropDismiss, so a dialog, sheet or drawer closes only when a
 * press and its release both land on the backdrop (a drag that starts inside a field and ends outside never closes
 * it). Controlled (`open` plus `onOpenChange`) or uncontrolled, exactly like Radix.
 */
export function Dialog({ open, defaultOpen, onOpenChange, ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
  const [inner, setInner] = useState(defaultOpen ?? false);
  const controlled = open !== undefined;
  const change = useCallback(
    (next: boolean) => {
      if (!controlled) setInner(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const dismiss = useCallback(() => change(false), [change]);
  return (
    <DismissContext.Provider value={dismiss}>
      <DialogPrimitive.Root {...props} open={controlled ? open : inner} onOpenChange={change} />
    </DismissContext.Provider>
  );
}

/** The close BackdropDismiss calls; null under a bare Radix root, where Radix's own outside press applies. */
export function useBackdropDismiss() {
  return useContext(DismissContext);
}

/** The scrim: fades with the layer (`sw-fx-scrim`) and closes it on a press and release that both land on it. */
export function BackdropDismiss({ className }: { className?: string }) {
  const dismiss = useBackdropDismiss();
  const pressed = useRef(false);
  return (
    <DialogPrimitive.Overlay
      className={className}
      onPointerDown={(event) => {
        pressed.current = event.button === 0 && event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressed.current && event.target === event.currentTarget) dismiss?.();
        pressed.current = false;
      }}
    />
  );
}
