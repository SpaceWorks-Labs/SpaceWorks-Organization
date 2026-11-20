"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Chip } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { BRAND_KIT_LIMITS, colourContrast, normalizeHexColour } from "@/lib/cards/brandKit";

/** One colour: a swatch that opens the picker, its hex code, how it reads as text, and remove. */
function ColourRow({ colour, index, disabled, onChange, onRemove }: { colour: string; index: number; disabled: boolean; onChange: (hex: string) => void; onRemove: () => void }) {
  const [text, setText] = useState(colour);
  const [seen, setSeen] = useState(colour);
  if (colour !== seen) {
    setSeen(colour);
    setText(colour);
  }
  const invalid = normalizeHexColour(text) === null;
  const contrast = colourContrast(colour);
  const errorId = `brand-colour-${index}-error`;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3">
      <div className="flex items-center gap-2">
        <ColorPicker
          plain
          value={colour}
          defaultColor={colour}
          label={`Colour ${index + 1}`}
          onChange={onChange}
          trigger={
            <button type="button" disabled={disabled} aria-label={`Change colour ${index + 1}, ${colour}`} className="size-11 shrink-0 rounded-control border border-line-strong" style={{ background: colour }} />
          }
        />
        <Input
          aria-label={`Hex code of colour ${index + 1}`}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className="min-w-0 flex-1 uppercase tabular-nums"
          value={text}
          maxLength={7}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            const hex = normalizeHexColour(event.target.value);
            if (hex && event.target.value.replace("#", "").length === 6) onChange(hex);
          }}
          onBlur={() => {
            const hex = normalizeHexColour(text);
            if (hex) onChange(hex);
            else setText(colour);
          }}
        />
        <IconButton label={`Remove ${colour}`} variant="danger" disabled={disabled} onClick={onRemove}>
          <Trash2 />
        </IconButton>
      </div>
      {invalid ? <p id={errorId} className="text-caption text-danger-fg">Use a hex code such as #006E63.</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <Chip size="sm" tone={contrast.readableOnWhite ? "success" : "neutral"}>
          {contrast.readableOnWhite ? "Readable on white" : "Not for text on white"} · {contrast.onWhite}:1
        </Chip>
        <Chip size="sm" tone={contrast.readableOnDark ? "success" : "neutral"}>
          {contrast.readableOnDark ? "Readable on dark" : "Not for text on dark"} · {contrast.onDark}:1
        </Chip>
      </div>
    </li>
  );
}

/** The kit's colours, with "Extract from logo" and "Add colour". */
export function BrandColours({ colours, disabled, extracting, canExtract, onChange, onExtract }: {
  colours: string[];
  disabled: boolean;
  extracting: boolean;
  canExtract: boolean;
  onChange: (colours: string[]) => void;
  onExtract: () => void;
}) {
  const full = colours.length >= BRAND_KIT_LIMITS.colours;
  const add = () => {
    const next = ["#142C2A", "#006E63", "#FF7447", "#DFFF8F", "#B5CDFF", "#FFD447"].find((hex) => !colours.includes(hex)) ?? "#000000";
    onChange([...colours, next]);
  };
  return (
    <section aria-labelledby="brand-colours-title" className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 id="brand-colours-title" className="text-label font-semibold text-ink">Colours</h3>
        <p className="text-caption text-ink-muted">Up to {BRAND_KIT_LIMITS.colours}. Each shows whether it reads as text on white and on Deep Ink (WCAG AA, 4.5:1).</p>
      </div>
      {colours.length ? (
        <ul className="flex flex-col gap-2">
          {colours.map((colour, index) => (
            <ColourRow
              key={index}
              colour={colour}
              index={index}
              disabled={disabled}
              onChange={(hex) => onChange(colours.map((item, i) => (i === index ? hex : item)).filter((item, i, all) => all.indexOf(item) === i))}
              onRemove={() => onChange(colours.filter((_, i) => i !== index))}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-line-strong p-4 text-caption text-ink-muted">No colours yet. Extract them from your logo or add your own.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={disabled || full || !canExtract} loading={extracting} loadingLabel="Extracting colours" onClick={onExtract}>
          Extract from logo
        </Button>
        <Button size="sm" variant="secondary" startIcon={<Plus />} disabled={disabled || full} onClick={add}>
          Add colour
        </Button>
      </div>
      {full ? <p className="text-caption text-ink-muted">The kit is full. Remove a colour to add another.</p> : null}
    </section>
  );
}
