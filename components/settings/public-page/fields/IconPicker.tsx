"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, X } from "lucide-react";
import { CARD_ICONS, cardIcon } from "@/lib/cards/design/icons";
import { BlockIcon } from "@/components/public/sections/Blocks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { SearchInput } from "@/components/ui/field";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const COLUMNS = 6;

/**
 * An icon from the card editor's set: a button showing the current icon and its name, opening a searchable grid of
 * 44px icon buttons. Arrow keys move through the grid; Tab and Enter work as usual. `allowNone` adds "No icon".
 */
export function IconPicker({ label, value, allowNone = false, disabled, error, onChange }: {
  label: string;
  value: string | null;
  allowNone?: boolean;
  disabled: boolean;
  error?: string;
  onChange: (icon: string | null) => void;
}) {
  const labelId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const current = value ? cardIcon(value) : undefined;
  const shown = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    return wanted ? CARD_ICONS.filter((icon) => icon.label.toLowerCase().includes(wanted) || icon.id.includes(wanted)) : CARD_ICONS;
  }, [query]);

  const choose = (icon: string | null) => {
    onChange(icon);
    setOpen(false);
    setQuery("");
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[event.key];
    if (!step) return;
    const buttons = [...(grid.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, at + step))]?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p id={labelId} className="text-label text-ink">{label}{allowNone ? <span className="ml-1.5 font-normal text-ink-muted">Optional</span> : null}</p>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
        <PopoverTrigger
          type="button"
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className={buttonClasses({ variant: "secondary", size: "sm", className: "w-fit justify-start" })}
        >
          {current ? <BlockIcon id={current.id} className="size-5" /> : null}
          <span>{current ? current.label : "Choose an icon"}</span>
          <ChevronDown aria-hidden className="size-4 text-ink-muted" />
        </PopoverTrigger>
        <PopoverContent className="flex w-[min(340px,90vw)] flex-col gap-3" aria-label={`${label}: choose an icon`}>
          <SearchInput value={query} aria-label="Search icons" placeholder="Search icons" onChange={(event) => setQuery(event.target.value)} />
          {allowNone ? (
            <button type="button" aria-pressed={value === null} onClick={() => choose(null)} className={buttonClasses({ variant: "ghost", size: "sm", className: "w-fit" })}>
              <X aria-hidden className="size-4" />No icon
            </button>
          ) : null}
          {shown.length ? (
            <div ref={grid} role="group" aria-label="Icons" onKeyDown={keys} className="grid max-h-[260px] grid-cols-6 gap-1 overflow-y-auto">
              {shown.map((icon) => (
                <button
                  key={icon.id}
                  type="button"
                  aria-label={icon.label}
                  aria-pressed={icon.id === value}
                  title={icon.label}
                  onClick={() => choose(icon.id)}
                  className={cn(
                    "inline-flex size-11 items-center justify-center rounded-control border transition-colors duration-(--sw-dur-fast) ease-sw",
                    icon.id === value ? "border-ink bg-muted text-ink" : "border-transparent text-ink-secondary hover:bg-muted hover:text-ink",
                  )}
                >
                  <BlockIcon id={icon.id} className="size-5" />
                </button>
              ))}
            </div>
          ) : <p className="text-body-ui text-ink-muted">No icons match &ldquo;{query}&rdquo;.</p>}
        </PopoverContent>
      </Popover>
      {error ? <p id={errorId} className="text-caption text-danger-fg">{error}</p> : null}
    </div>
  );
}
