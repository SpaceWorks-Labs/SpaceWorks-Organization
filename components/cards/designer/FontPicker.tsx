"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SearchInput } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { CARD_FONT_CATEGORY_LABELS, CARD_FONTS, cardFont, type CardFontCategory } from "@/lib/cards/fontCatalog";
import { cardFontStack } from "../cardFonts";

const CATEGORIES = Object.keys(CARD_FONT_CATEGORY_LABELS) as CardFontCategory[];

/** Every card font, grouped and searchable, each name shown in its own face. */
export function FontPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = cardFont(value);
  const matches = CARD_FONTS.filter((font) => font.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Font: ${current.label}`} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-full border border-line bg-panel px-4 text-left text-ink hover:bg-muted">
          <span className="truncate text-[16px]" style={{ fontFamily: cardFontStack(current.id) }}>{current.label}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label="Fonts" className="flex w-[min(320px,calc(100vw-32px))] flex-col gap-2 p-3">
        <SearchInput aria-label="Find a font" placeholder="Find a font" value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} />
        <div className="max-h-[360px] overflow-y-auto pr-1">
          {CATEGORIES.map((category) => {
            const fonts = matches.filter((font) => font.category === category);
            if (!fonts.length) return null;
            return (
              <div key={category} role="group" aria-label={CARD_FONT_CATEGORY_LABELS[category]} className="flex flex-col py-1">
                <p className="px-2 py-1 text-caption font-semibold text-ink-muted">{CARD_FONT_CATEGORY_LABELS[category]}</p>
                {fonts.map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    aria-pressed={font.id === current.id}
                    onClick={() => { onChange(font.id); setOpen(false); }}
                    className={cn("rounded-lg px-2 py-1.5 text-left text-[17px] text-ink hover:bg-muted", font.id === current.id && "bg-subtle font-semibold")}
                    style={{ fontFamily: cardFontStack(font.id) }}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            );
          })}
          {matches.length === 0 ? <p className="px-2 py-3 text-caption text-ink-muted">No font matches that name.</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
