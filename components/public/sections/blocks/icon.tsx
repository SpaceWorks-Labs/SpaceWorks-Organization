import { CARD_ICONS, ICON_VIEWBOX, cardIcon } from "@/lib/cards/design/icons";
import { cn } from "@/lib/cn";

/** An icon from the card editor's set, drawn as a 2-unit round-capped stroke. Unknown ids draw nothing. */
export function BlockIcon({ id, className }: { id: string; className?: string }) {
  const icon = cardIcon(id);
  if (!icon) return null;
  return (
    <svg aria-hidden viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`} className={cn("size-6 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={icon.d} />
    </svg>
  );
}

export const ICON_IDS = CARD_ICONS.map((icon) => icon.id);

/** An icon in a round accent-tinted mark, for lists and columns. */
export function IconMark({ id, size = "md" }: { id: string; size?: "sm" | "md" }) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text", size === "md" ? "size-12" : "size-9")}>
      <BlockIcon id={id} className={size === "md" ? "size-6" : "size-5"} />
    </span>
  );
}

export const formatCount = (value: number, locale: string | null) => new Intl.NumberFormat(locale ?? "en-IN").format(value);
