"use client";

import { useEffect, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { MOTION_MS } from "./reducedMotion";

/** The stagger spreads the first eight children 30ms apart; after this the class is dropped for good. */
const STAGGER_DONE_MS = MOTION_MS.slow + 7 * 30 + 80;

/**
 * A layout container whose first eight children fade and rise a few pixels, 30ms apart, the first time it mounts
 * (kit motion/page-enter `.sw-stagger`). The class is dropped once that has played, so refetches, pagination, filter
 * changes and re-renders never replay it. Nothing moves under reduced motion. On an organisation's own pages pass
 * `enabled={organisation.delightEnabled}` (CR-MOTION-01: delight on by default, with the space's opt-out). Use it for card grids and lists on
 * first load, never on payment, pay-link or scanner paths.
 */
export function StaggerGroup({ as: Tag = "div", enabled = true, className, children }: { as?: ElementType; enabled?: boolean; className?: string; children: ReactNode }) {
  const [first, setFirst] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setFirst(false), STAGGER_DONE_MS);
    return () => clearTimeout(timer);
  }, []);
  return <Tag className={cn(className, enabled && first && "sw-stagger")}>{children}</Tag>;
}
