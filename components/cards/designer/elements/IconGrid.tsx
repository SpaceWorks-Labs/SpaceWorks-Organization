"use client";

import { cn } from "@/lib/cn";
import { CARD_ICONS } from "@/lib/cards/design/icons";
import { matchesQuery } from "@/lib/cards/design/library/catalog";

/** One icon drawn as the card draws it: stroked paths on a 24-unit grid. */
export function IconGlyph({ d, className }: { d: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={cn("size-6", className)}>
      <path d={d} />
    </svg>
  );
}

/** The icons matching `query`, as 44px buttons named after each icon. */
export function IconGrid({ query, selected, disabled, onChoose }: { query: string; selected?: string; disabled?: boolean; onChoose: (icon: { id: string; label: string }) => void }) {
  const icons = CARD_ICONS.filter((icon) => matchesQuery(query, icon.label, icon.id));
  if (!icons.length) return <p className="py-2 text-caption text-ink-muted">No icon matches that word.</p>;
  return (
    <div role="group" aria-label="Icons" className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1">
      {icons.map((icon) => (
        <button
          key={icon.id}
          type="button"
          aria-label={icon.label}
          title={icon.label}
          aria-pressed={selected === undefined ? undefined : selected === icon.id}
          disabled={disabled}
          onClick={() => onChoose(icon)}
          className={cn(
            "grid size-11 place-items-center rounded-lg border text-ink transition-colors duration-(--sw-dur-fast) hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))] disabled:opacity-40 motion-reduce:transition-none",
            selected === icon.id ? "border-primary bg-subtle" : "border-transparent",
          )}
        >
          <IconGlyph d={icon.d} />
        </button>
      ))}
    </div>
  );
}
