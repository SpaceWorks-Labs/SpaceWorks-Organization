import { cn } from "@/lib/cn";
import { BoxArt } from "./BoxSpinner";

/**
 * The loading state for a whole page or panel (CR-MOTION-01, kit motion/box-open): the Space Works box opens, holds,
 * folds shut and repeats (4400ms, a named non-blocking exception), small and centred, with the artwork for the
 * current theme. Under reduced motion it is the still, open logo. A polite status that prints `label` under the box
 * (CR-MOTION-01: a meaningful status label, e.g. "Loading the dashboard"); compact inline uses pass
 * `showLabel={false}` to keep it for screen readers only. Never focusable. Buttons, fields and rows use BoxSpinner.
 */
export function LogoLoader({ label = "Loading", size = 72, showLabel = true, className = "min-h-40 py-10" }: { label?: string; size?: number; showLabel?: boolean; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("grid w-full place-items-center content-center gap-2", className)}>
      <BoxArt size={size} />
      <span className={showLabel ? "text-sm font-semibold text-ink-muted" : "sr-only"}>{label}</span>
    </div>
  );
}
