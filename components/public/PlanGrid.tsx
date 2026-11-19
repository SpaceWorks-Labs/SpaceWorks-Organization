"use client";

import type { ReactNode } from "react";
import { StaggerGroup } from "@/components/motion/StaggerGroup";
import { useDelight } from "./motion/Delight";

/** The plan cards' list: it staggers in once while the organisation keeps playful touches on (reduced motion: still). */
export function PlanGrid({ className, children }: { className?: string; children: ReactNode }) {
  return useDelight() ? <StaggerGroup as="ul" className={className}>{children}</StaggerGroup> : <ul className={className}>{children}</ul>;
}
