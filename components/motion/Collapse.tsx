"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { MOTION_MS } from "./reducedMotion";
import { usePresence } from "./usePresence";

/**
 * Animated show/hide for a region (kit motion/collapse): grid rows 0fr to 1fr with a fade, base (180ms) to open and
 * fast (120ms) to close. The rows open from the region's own place, so neighbours stay where they are and are pushed
 * down smoothly rather than jumping. The wrapper with `id` always exists (for `aria-controls`); children unmount
 * once the close has played, so hidden content is never reachable by Tab, and the closing region is inert.
 * Reduced motion: opens and closes at once.
 */
export function Collapse({ open, id, className, children }: { open: boolean; id?: string; className?: string; children: ReactNode }) {
  const presence = usePresence(open, MOTION_MS.fast);
  return (
    <div id={id} className={cn("sw-collapse", className)} data-state={open ? "open" : "closed"} inert={!open} aria-hidden={!open || undefined}>
      <div className="sw-collapse-inner">{presence.present ? children : null}</div>
    </div>
  );
}

/**
 * A disclosure: a full-width button that shows or hides the region below it. The chevron turns over fast (120ms), reporting
 * the new state before the content finishes moving. Pass `open` and `onOpenChange` to control it.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  className,
  buttonClassName,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  buttonClassName?: string;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const open = controlled ?? inner;
  const id = useId();
  const toggle = () => {
    if (controlled === undefined) setInner(!open);
    onOpenChange?.(!open);
  };
  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-3 text-left text-[15px] font-semibold text-ink transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]",
          buttonClassName,
        )}
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown aria-hidden className="sw-chevron size-4 shrink-0 text-ink-muted" />
      </button>
      <Collapse open={open} id={id}>
        {children}
      </Collapse>
    </div>
  );
}
