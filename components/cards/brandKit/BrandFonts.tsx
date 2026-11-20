"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { FontPicker } from "@/components/cards/designer/FontPicker";
import { BRAND_KIT_LIMITS } from "@/lib/cards/brandKit";
import { CARD_FONTS, cardFont } from "@/lib/cards/fontCatalog";

/** Up to four preferred card fonts, each chosen from the card font library. */
export function BrandFonts({ fonts, disabled, onChange }: { fonts: string[]; disabled: boolean; onChange: (fonts: string[]) => void }) {
  const full = fonts.length >= BRAND_KIT_LIMITS.fonts;
  return (
    <section aria-labelledby="brand-fonts-title" className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 id="brand-fonts-title" className="text-label font-semibold text-ink">Fonts</h3>
        <p className="text-caption text-ink-muted">Up to {BRAND_KIT_LIMITS.fonts} from the card font library, offered first in the designer.</p>
      </div>
      {fonts.length ? (
        <ul className="flex flex-col gap-2">
          {fonts.map((id, index) => (
            <li key={index} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                {disabled ? (
                  <p className="flex min-h-11 items-center rounded-control border border-line bg-subtle px-4 text-ink">{cardFont(id).label}</p>
                ) : (
                  <FontPicker value={id} onChange={(next) => onChange(fonts.map((item, i) => (i === index ? next : item)).filter((item, i, all) => all.indexOf(item) === i))} />
                )}
              </div>
              <IconButton label={`Remove ${cardFont(id).label}`} variant="danger" disabled={disabled} onClick={() => onChange(fonts.filter((_, i) => i !== index))}>
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-line-strong p-4 text-caption text-ink-muted">No fonts chosen. Cards use Gilroy unless a design says otherwise.</p>
      )}
      <div>
        <Button
          size="sm"
          variant="secondary"
          startIcon={<Plus />}
          disabled={disabled || full}
          onClick={() => onChange([...fonts, CARD_FONTS.find((font) => !fonts.includes(font.id))!.id])}
        >
          Add font
        </Button>
      </div>
    </section>
  );
}
