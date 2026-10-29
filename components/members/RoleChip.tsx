import { cn } from "@/lib/cn";

/** Brand colours a member role can carry: on chips here and on member cards. */
export const ROLE_COLORS = ["teal", "citron", "sky", "yellow", "orange", "ink"] as const;
type RoleColor = (typeof ROLE_COLORS)[number];

const ROLE_TONES: Record<RoleColor, string> = {
  teal: "bg-sw-teal text-sw-cream",
  citron: "bg-sw-citron text-sw-ink",
  sky: "bg-sw-sky text-sw-ink",
  yellow: "bg-sw-yellow text-sw-ink",
  orange: "bg-sw-orange text-sw-ink",
  ink: "bg-sw-ink text-sw-cream",
};

export function roleTone(color: string) {
  return ROLE_TONES[(ROLE_COLORS as readonly string[]).includes(color) ? (color as RoleColor) : "teal"];
}

/** A member's organisation role, as a small filled pill. `primary` marks the one printed on the card. */
export function RoleChip({ name, color, primary, className }: { name: string; color: string; primary?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-caption font-semibold", roleTone(color), className)}>
      {name}
      {primary ? <span className="sr-only"> (on card)</span> : null}
    </span>
  );
}
