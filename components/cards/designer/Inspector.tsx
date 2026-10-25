"use client";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  CARD_ELEMENTS,
  elementBoxHeightMm,
  isSquareElement,
  isTextElement,
  layoutFlags,
  minimumElementSizeMm,
  type CardElement,
  type CardSideSettings,
} from "@/lib/cards/design/elements";
import { layoutForPaper } from "@/lib/cards/design/geometry";
import type { CardBranding } from "@/lib/cards/types";
import { ELEMENT_LABELS, SAFE_MARGIN_MM } from "../canvasInteraction";
import { DEFAULT_CARD_FONT } from "@/lib/cards/fontCatalog";
import { NumberSlider, SwitchLine } from "./controls";
import { FontPicker } from "./FontPicker";

/** Which built-in items show on a side right now. */
export function itemVisibility(settings: CardSideSettings, branding: CardBranding): Record<CardElement, boolean> {
  return {
    header: Boolean((settings.showCardLabel && settings.cardLabel.trim()) || settings.heading.trim()),
    name: settings.showName,
    role: settings.showRole,
    plan: settings.showPlan,
    details: settings.printFieldKeys.length > 0,
    qr: settings.showQr,
    footer: settings.showFooter && Boolean(settings.footerText.trim()),
    logo: settings.showLogo && Boolean(branding.organisationLogoUrl),
    symbol: settings.showSymbol,
    photo: settings.showPhoto,
    idNumber: settings.showIdNumber,
    validUntil: settings.showValidUntil,
  };
}

/** The selected item's size, weight and position, with alignment shortcuts and resets. */
export function Inspector({ settings, branding, selected, onSelect, update }: {
  settings: CardSideSettings;
  branding: CardBranding;
  selected: CardElement;
  onSelect: (element: CardElement) => void;
  update: (patch: Partial<CardSideSettings>) => void;
}) {
  const square = isSquareElement(selected);
  const text = isTextElement(selected);
  const at = settings.elementPositions[selected];
  const size = settings.elementSizes[selected];
  const visible = itemVisibility(settings, branding);
  const place = (xMm: number, yMm: number) => update({ elementPositions: { ...settings.elementPositions, [selected]: { xMm: Math.round(xMm * 10) / 10, yMm: Math.round(yMm * 10) / 10 } } });
  const height = elementBoxHeightMm(selected, settings.elementSizes);
  const align = {
    left: () => place(SAFE_MARGIN_MM, at.yMm),
    centre: () => place((settings.widthMm - size) / 2, at.yMm),
    right: () => place(settings.widthMm - size - SAFE_MARGIN_MM, at.yMm),
    top: () => place(at.xMm, SAFE_MARGIN_MM),
    middle: () => place(at.xMm, (settings.heightMm - height) / 2),
    bottom: () => place(at.xMm, settings.heightMm - height - SAFE_MARGIN_MM),
  };
  const fresh = () => layoutForPaper(settings.template, settings.widthMm, settings.heightMm, layoutFlags(settings));
  const resetItem = () => {
    const layout = fresh();
    update({
      elementPositions: { ...settings.elementPositions, [selected]: layout.elementPositions[selected] },
      elementSizes: { ...settings.elementSizes, [selected]: layout.elementSizes[selected] },
      elementTextSizes: { ...settings.elementTextSizes, [selected]: layout.elementTextSizes[selected] },
      elementBold: { ...settings.elementBold, [selected]: layout.elementBold[selected] },
    });
  };
  const minimum = minimumElementSizeMm(selected);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-label font-semibold text-ink">Items on this side</h3>
        <div role="radiogroup" aria-label="Select an item" className="flex flex-wrap gap-1.5">
          {CARD_ELEMENTS.filter((element) => visible[element] || element === selected).map((element) => (
            <button
              key={element}
              type="button"
              role="radio"
              aria-checked={selected === element}
              onClick={() => onSelect(element)}
              className={cn(
                "min-h-9 rounded-full border px-3 text-[14px] transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                selected === element ? "border-primary bg-primary font-semibold text-on-primary" : "border-line text-ink-secondary hover:bg-subtle hover:text-ink",
              )}
            >
              {ELEMENT_LABELS[element]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line p-3.5">
        <p className="text-label font-semibold text-ink">{ELEMENT_LABELS[selected]}</p>
        {!visible[selected] ? <p className="text-caption text-ink-muted">Hidden on this side right now.</p> : null}
        {text ? (
          <NumberSlider label="Text size" unit="pt" min={6} max={48} step={0.5} value={settings.elementTextSizes[selected]} onChange={(value) => update({ elementTextSizes: { ...settings.elementTextSizes, [selected]: value } })} />
        ) : null}
        <NumberSlider label={square ? "Size" : "Box width"} unit="mm" min={minimum} max={Math.max(minimum, settings.widthMm - 4)} step={1} value={size} onChange={(value) => update({ elementSizes: { ...settings.elementSizes, [selected]: value } })} />
        {text ? <SwitchLine label="Bold" checked={settings.elementBold[selected]} onCheckedChange={(bold) => update({ elementBold: { ...settings.elementBold, [selected]: bold } })} /> : null}
        {isTextElement(selected) ? <FontPicker value={settings.elementFonts[selected] ?? DEFAULT_CARD_FONT} onChange={(font) => update({ elementFonts: { ...settings.elementFonts, [selected]: font } })} /> : null}
        <div className="grid grid-cols-2 gap-2">
          <Field label="From left (mm)"><Input type="number" step={settings.gridSizeMm} value={at.xMm} onChange={(event) => place(Number(event.target.value), at.yMm)} /></Field>
          <Field label="From top (mm)"><Input type="number" step={settings.gridSizeMm} value={at.yMm} onChange={(event) => place(at.xMm, Number(event.target.value))} /></Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-caption text-ink-muted">Align on the card</p>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(align) as Array<keyof typeof align>).map((key) => (
              <Button key={key} size="sm" variant="secondary" className="px-2 capitalize" onClick={align[key]}>{key}</Button>
            ))}
          </div>
        </div>
        <Button size="sm" variant="quiet" onClick={resetItem} className="self-start">Reset this item</Button>
      </div>

      {selected === "qr" && size < 16 ? <Callout tone="warning">Keep the QR at least 16 mm so phones scan it reliably once printed.</Callout> : null}
      {selected === "symbol" ? <p className="text-caption text-ink-muted">Keep a quarter of the symbol&apos;s height clear on every side.</p> : null}

      <Button size="sm" variant="quiet" className="self-start" onClick={() => update(fresh())}>Reset the whole layout</Button>
    </div>
  );
}
