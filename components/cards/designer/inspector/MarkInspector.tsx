"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Callout } from "@/components/ui/display";
import { Field, Input, SearchInput } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { contrastRatio } from "@/lib/theme/accent";
import { cardIcon } from "@/lib/cards/design/icons";
import { BRAND } from "@/lib/cards/palette";
import { PHOTO_MASKS, type CardBarcodeLayer, type CardIconLayer, type CardLineLayer, type CardPhotoLayer, type CardPhotoMask, type CardQrLayer } from "@/lib/cards/design/layerTypes";
import { ColourField } from "../ColourField";
import { SwitchLine } from "../controls";
import { IconGlyph, IconGrid } from "../elements/IconGrid";
import { Choice, Slider, type ColourContext } from "./fields";
import { C, TARGET } from "./inspectorControls";

type Props<T> = { layer: T; onChange: (patch: Partial<T>) => void; colours: ColourContext };

/** Scanners need the code to stand out from what is behind it. */
export const CODE_CONTRAST_MIN = 3;

export function LineInspector({ layer, onChange, colours }: Props<CardLineLayer>) {
  return (
    <>
      <ColourField label={C.lineColour.label} value={layer.color} {...colours} onChange={(color) => color && onChange({ color })} />
      <Slider label={C.thickness.label} unit="mm" min={0.1} max={5} step={0.1} value={layer.hMm} onChange={(hMm) => onChange({ hMm })} />
      <Choice<CardLineLayer["dash"]> label={C.dash.label} value={layer.dash} options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }]} onChange={(dash) => onChange({ dash })} />
    </>
  );
}

export function IconInspector({ layer, onChange, colours }: Props<CardIconLayer>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = cardIcon(layer.icon);
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-caption text-ink-muted">{C.icon.label}</p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" aria-label={`${C.icon.label}: ${current?.label ?? layer.icon}`} className={cn(TARGET.picker, "flex w-full items-center gap-2 rounded-control border border-line bg-panel px-4 text-left text-ink hover:bg-muted")}>
              {current ? <IconGlyph d={current.d} className="size-5" /> : null}
              <span className="flex-1 truncate">{current?.label ?? layer.icon}</span>
              <ChevronDown aria-hidden className="size-4 text-ink-muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent aria-label="Icons" className="flex w-[min(320px,calc(100vw-32px))] flex-col gap-2 p-3">
            <SearchInput aria-label="Find an icon" placeholder="Find an icon" value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} />
            <div className="max-h-[300px] overflow-y-auto">
              <IconGrid query={query} selected={layer.icon} onChoose={(icon) => { onChange({ icon: icon.id }); setOpen(false); }} />
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <ColourField label={C.iconColour.label} value={layer.color} {...colours} onChange={(color) => color && onChange({ color })} />
      <Slider label={C.iconStroke.label} unit="mm" min={0.1} max={2} step={0.05} value={layer.strokeMm} onChange={(strokeMm) => onChange({ strokeMm })} />
    </>
  );
}

export function QrInspector({ layer, onChange, colours }: Props<CardQrLayer>) {
  const ratio = contrastRatio(layer.dark, layer.light ?? BRAND.white);
  return (
    <>
      <ColourField label={C.qrDark.label} value={layer.dark} {...colours} onChange={(dark) => dark && onChange({ dark })} />
      <ColourField label={C.qrLight.label} allowNone value={layer.light} {...colours} onChange={(light) => onChange({ light })} />
      {ratio < CODE_CONTRAST_MIN ? <Callout tone="warning">Scanners may not read this code: its colours are too alike ({ratio.toFixed(1)}:1). Use colours at least 3:1 apart, such as a dark code on white.</Callout> : null}
      {layer.light === null ? <p className="text-caption text-ink-muted">With no background, the code sits on whatever is under it. Check it stands out clearly.</p> : null}
    </>
  );
}

export function BarcodeInspector({ layer, onChange, colours }: Props<CardBarcodeLayer>) {
  const ratio = contrastRatio(layer.color, layer.background ?? BRAND.white);
  return (
    <>
      <ColourField label={C.barcodeColour.label} value={layer.color} {...colours} onChange={(color) => color && onChange({ color })} />
      <ColourField label={C.barcodeBackground.label} allowNone value={layer.background} {...colours} onChange={(background) => onChange({ background })} />
      {ratio < CODE_CONTRAST_MIN ? <Callout tone="warning">Scanners may not read this barcode: its colours are too alike ({ratio.toFixed(1)}:1). Use colours at least 3:1 apart.</Callout> : null}
      <SwitchLine label={C.barcodeText.label} hint="Prints the card number under the bars." checked={layer.showText} onCheckedChange={(showText) => onChange({ showText })} />
    </>
  );
}

const PHOTO_LABELS: Record<CardPhotoMask, string> = { circle: "Circle", rounded: "Rounded", hexagon: "Hexagon", square: "Square" };

export function PhotoInspector({ layer, onChange, colours }: Props<CardPhotoLayer>) {
  return (
    <>
      <Choice label={C.photoMask.label} value={layer.mask} options={PHOTO_MASKS.map((mask) => ({ value: mask, label: PHOTO_LABELS[mask] }))} onChange={(mask) => onChange({ mask })} />
      <ColourField label={C.ring.label} allowNone value={layer.stroke} {...colours} onChange={(stroke) => onChange({ stroke })} />
      {layer.stroke ? <Slider label={C.ringWidth.label} unit="mm" min={0.1} max={3} step={0.1} value={layer.strokeMm} onChange={(strokeMm) => onChange({ strokeMm })} /> : null}
      <Field label={C.photoPlaceholder.label} optional helperText="Left empty, members without a photo show their initials.">
        <Input maxLength={40} value={layer.placeholder} onChange={(event) => onChange({ placeholder: event.target.value })} />
      </Field>
    </>
  );
}
