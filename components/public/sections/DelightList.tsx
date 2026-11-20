"use client";

import type { ElementType, ReactNode } from "react";
import { StaggerGroup } from "@/components/motion/StaggerGroup";
import { useDelight } from "../motion/Delight";

/**
 * A list of items (numbers, people, quotes) that staggers in once while the organisation keeps playful touches on;
 * with them off, or under reduced motion, it is a plain still list. Never use it for anything carrying a tenant logo.
 */
export function DelightList({ as: Tag = "ul", className, children }: { as?: ElementType; className?: string; children: ReactNode }) {
  return useDelight() ? <StaggerGroup as={Tag} className={className}>{children}</StaggerGroup> : <Tag className={className}>{children}</Tag>;
}
