import { cn } from "@/lib/cn";
import { BoxArt } from "@/components/brand/BoxSpinner";

/**
 * A decorative loading placeholder (kit motion/skeleton): a still surface with the small box loader in it, no shimmer
 * sweep. Size it with `className` to match what will arrive; callers announce the loading state themselves (or use
 * LogoLoader for a whole panel).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("grid min-h-6 place-items-center rounded-control bg-surface", className)}>
      <BoxArt size={20} />
    </div>
  );
}

/** Skeleton lines with no box, for text that is about to arrive inside a card that already shows a loader. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="block h-3 rounded-full bg-surface" style={{ width: index === lines - 1 ? "60%" : "100%" }} />
      ))}
    </div>
  );
}
