"use client";

import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import {
  FOOTER_MAX_LENGTH,
  WATERMARK_OPACITY_MAX,
  WATERMARK_OPACITY_MIN,
  type CardElement,
  type CardLayoutFlags,
  type CardSideSettings,
} from "@/lib/cards/design/elements";
import type { CardSide } from "@/lib/cards/design/presets";
import { BRAND, CARD_ACCENT_KEYS, CARD_BACKGROUND_KEYS, CARD_TEXT_KEYS, orgAccentHex, resolveCardPalette } from "@/lib/cards/palette";
import type { CardBranding } from "@/lib/cards/types";
import { ColourField } from "./ColourField";
import { NumberSlider, Section, SwatchGroup, SwitchLine, ToggleField } from "./controls";

export type DesignerField = { key: string; label: string };

/** Colour, text, items and watermark for the side being edited. */
export function SideSettings({ side, current, branding, fields, uploading, update, toggleItem, onWatermark }: {
  side: CardSide;
  current: CardSideSettings;
  branding: CardBranding;
  fields: DesignerField[];
  uploading: boolean;
  update: (patch: Partial<CardSideSettings>) => void;
  toggleItem: (flag: keyof CardLayoutFlags, on: boolean, element: CardElement) => void;
  onWatermark: (file: File | null) => void;
}) {
  const orgColour = orgAccentHex(branding.orgAccent);
  const custom = current.customColours;
  const colourOf = (own: string) => (key: string) => (key === "custom" ? own : key === "org" ? orgColour : key === "auto" ? null : BRAND[key as keyof typeof BRAND]);
  const ownColour = (which: keyof typeof custom, label: string) => (
    <ColourField label={label} value={custom[which]} orgAccent={orgColour} onChange={(hex) => hex && update({ customColours: { ...custom, [which]: hex } })} />
  );
  const palette = resolveCardPalette(current, branding.orgAccent);
  const mark = current.watermark;
  const toggleField = (key: string, on: boolean) => update({ printFieldKeys: on ? [...current.printFieldKeys, key] : current.printFieldKeys.filter((item) => item !== key) });

  return (
    <>
      <Section title="Colour">
        <SegmentedControl<CardSideSettings["colorMode"]>
          ariaLabel="Colour mode"
          size="sm"
          value={current.colorMode}
          onValueChange={(colorMode) => update({ colorMode })}
          options={[{ value: "colour", label: "Colour" }, { value: "mono", label: "Black and white" }]}
          className="self-start"
        />
        {current.colorMode === "mono" ? (
          <p className="text-caption text-ink-muted">Print economy: black on white only, for laser and thermal printers. Logos and photos print in grey.</p>
        ) : (
          <>
            <SwatchGroup label="Card" value={current.backgroundColor} options={CARD_BACKGROUND_KEYS} colourOf={colourOf(custom.background)} onChange={(backgroundColor) => update({ backgroundColor })} />
            {current.backgroundColor === "custom" ? ownColour("background", "Your card colour") : null}
            <SwatchGroup label={current.template === "bold" ? "Band and accents" : "Frame and accents"} value={current.accentColor} options={CARD_ACCENT_KEYS} colourOf={colourOf(custom.accent)} onChange={(accentColor) => update({ accentColor })} />
            {current.accentColor === "custom" ? ownColour("accent", "Your accent colour") : null}
            <SwatchGroup label="Text" value={current.textColor} options={CARD_TEXT_KEYS} colourOf={colourOf(custom.text)} onChange={(textColor) => update({ textColor })} />
            {current.textColor === "custom" ? ownColour("text", "Your text colour") : null}
            {palette.textAdjusted ? <Callout tone="warning">That text colour doesn&apos;t have enough contrast on this card, so text prints in the automatic colour.</Callout> : null}
          </>
        )}
      </Section>

      <Section title="Text">
        <Field label="Heading"><Input maxLength={120} value={current.heading} onChange={(event) => update({ heading: event.target.value })} /></Field>
        <ToggleField label="Label above the heading" checked={current.showCardLabel} onCheckedChange={(showCardLabel) => update({ showCardLabel })}>
          <Input maxLength={40} value={current.cardLabel} disabled={!current.showCardLabel} onChange={(event) => update({ cardLabel: event.target.value })} />
        </ToggleField>
        <ToggleField label={side === "back" ? "Note" : "Footer"} checked={current.showFooter} onCheckedChange={(showFooter) => update({ showFooter })}>
          <Input maxLength={FOOTER_MAX_LENGTH} value={current.footerText} disabled={!current.showFooter} onChange={(event) => update({ footerText: event.target.value })} />
        </ToggleField>
      </Section>

      <Section title="On this side">
        <SwitchLine label="Name" checked={current.showName} onCheckedChange={(showName) => update({ showName })} />
        <SwitchLine label="Photo" hint="The member's photo, or their initials." checked={current.showPhoto} onCheckedChange={(on) => toggleItem("showPhoto", on, "photo")} />
        {current.showPhoto ? (
          <SegmentedControl<CardSideSettings["photoShape"]>
            ariaLabel="Photo shape"
            size="sm"
            value={current.photoShape}
            onValueChange={(photoShape) => update({ photoShape })}
            options={[{ value: "rounded", label: "Rounded square" }, { value: "circle", label: "Circle" }]}
            className="self-start"
          />
        ) : null}
        <SwitchLine label="Role" hint="The member's primary role." checked={current.showRole} onCheckedChange={(on) => toggleItem("showRole", on, "role")} />
        <SwitchLine label="Plan" checked={current.showPlan} onCheckedChange={(on) => toggleItem("showPlan", on, "plan")} />
        <SwitchLine label="Card number" checked={current.showIdNumber} onCheckedChange={(on) => toggleItem("showIdNumber", on, "idNumber")} />
        {current.showIdNumber ? <Field label="Card number label"><Input maxLength={30} value={current.idNumberLabel} onChange={(event) => update({ idNumberLabel: event.target.value })} placeholder="No label" /></Field> : null}
        <SwitchLine label="Valid until" checked={current.showValidUntil} onCheckedChange={(on) => toggleItem("showValidUntil", on, "validUntil")} />
        {current.showValidUntil ? <Field label="Valid until label"><Input maxLength={30} value={current.validUntilLabel} onChange={(event) => update({ validUntilLabel: event.target.value })} placeholder="No label" /></Field> : null}
        <SwitchLine label="Check QR code" hint="Opens the public check page for this card." checked={current.showQr} onCheckedChange={(showQr) => update({ showQr })} />
        <SwitchLine
          label="Organisation logo"
          hint={branding.organisationLogoUrl ? undefined : "Add a logo in Profile settings first."}
          disabled={!branding.organisationLogoUrl}
          checked={current.showLogo && Boolean(branding.organisationLogoUrl)}
          onCheckedChange={(on) => toggleItem("showLogo", on, "logo")}
        />
        <SwitchLine label="Space Works symbol" hint="Placed unaltered, with clear space around it." checked={current.showSymbol} onCheckedChange={(on) => toggleItem("showSymbol", on, "symbol")} />
      </Section>

      {fields.length ? (
        <Section title="Answers on this side">
          {fields.map((field) => (
            <SwitchLine key={field.key} label={field.label} checked={current.printFieldKeys.includes(field.key)} onCheckedChange={(on) => toggleField(field.key, on)} />
          ))}
          <p className="text-caption text-ink-muted">Answers from the join form. Questions only managers fill never print.</p>
        </Section>
      ) : null}

      <Section title="Watermark">
        <SegmentedControl<CardSideSettings["watermark"]["kind"]>
          ariaLabel="Watermark"
          size="sm"
          value={mark.kind}
          onValueChange={(kind) => update({ watermark: { ...mark, kind } })}
          options={[{ value: "none", label: "None" }, { value: "text", label: "Text" }, { value: "image", label: "Image" }]}
          className="self-start"
        />
        {mark.kind === "text" ? <Field label="Watermark text"><Input maxLength={32} value={mark.text} placeholder="MEMBER" onChange={(event) => update({ watermark: { ...mark, text: event.target.value } })} /></Field> : null}
        {mark.kind === "image" ? (
          <div className="flex flex-col gap-2">
            <Field label="Watermark image" helperText={branding.watermarkUrl ? "Shared by both sides. Choose a file to replace it." : "A simple mark works best. PNG with transparency, up to 5 MB."}>
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => onWatermark(event.target.files?.[0] ?? null)} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-full file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
            </Field>
            {branding.watermarkUrl ? <Button size="sm" variant="quiet" className="self-start" disabled={uploading} onClick={() => onWatermark(null)}>Remove image</Button> : null}
          </div>
        ) : null}
        {mark.kind !== "none" ? (
          <>
            <NumberSlider label="Strength" unit="%" min={WATERMARK_OPACITY_MIN} max={WATERMARK_OPACITY_MAX} step={1} value={mark.opacityPct} onChange={(opacityPct) => update({ watermark: { ...mark, opacityPct } })} />
            <SegmentedControl<CardSideSettings["watermark"]["colour"]>
              ariaLabel="Watermark colour"
              size="sm"
              value={mark.colour}
              onValueChange={(colour) => update({ watermark: { ...mark, colour } })}
              options={[{ value: "accent", label: "Accent colour" }, { value: "text", label: "Text colour" }]}
              className="self-start"
            />
            {mark.kind === "text" ? <NumberSlider label="Angle" unit="°" min={-60} max={60} step={5} value={mark.angleDeg} onChange={(angleDeg) => update({ watermark: { ...mark, angleDeg } })} /> : null}
          </>
        ) : null}
      </Section>
    </>
  );
}
