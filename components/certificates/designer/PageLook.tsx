"use client";

import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { ColourField } from "@/components/cards/designer/ColourField";
import { NumberSlider, Section, SwatchGroup } from "@/components/cards/designer/controls";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import type { CardBackground } from "@/lib/cards/design/layerTypes";
import { BRAND, CARD_BACKGROUND_KEYS, orgAccentHex } from "@/lib/cards/palette";
import type { CardBranding } from "@/lib/cards/types";

/**
 * The page itself: colour or black and white, the page colour, and a picture behind every layer (the
 * organisation's own upload, through uploadCertificateArtwork).
 */
export function PageLook({ current, branding, uploading, brandColours, documentColours, update, onUploadBackground }: {
  current: CardSideSettings;
  branding: CardBranding;
  uploading: boolean;
  brandColours?: readonly string[];
  documentColours?: readonly string[];
  update: (patch: Partial<CardSideSettings>) => void;
  onUploadBackground: (file: File) => void;
}) {
  const orgColour = orgAccentHex(branding.orgAccent);
  const custom = current.customColours;
  const colourOf = (key: string) => (key === "custom" ? custom.background : key === "org" ? orgColour : BRAND[key as keyof typeof BRAND] ?? null);
  const background = current.background;
  const setBackground = (patch: Partial<CardBackground>) => update({ background: { ...background, ...patch } });
  return (
    <>
      <Section title="Page colour">
        <SegmentedControl<CardSideSettings["colorMode"]> ariaLabel="Colour mode" size="sm" value={current.colorMode} onValueChange={(colorMode) => update({ colorMode })} options={[{ value: "colour", label: "Colour" }, { value: "mono", label: "Black and white" }]} className="self-start" />
        {current.colorMode === "mono" ? (
          <p className="text-caption text-ink-muted">Black on white only, for office printers. Pictures and photos print in grey.</p>
        ) : (
          <>
            <SwatchGroup label="Page" value={current.backgroundColor} options={CARD_BACKGROUND_KEYS} colourOf={colourOf} onChange={(backgroundColor) => update({ backgroundColor })} />
            {current.backgroundColor === "custom" ? <ColourField label="Your page colour" value={custom.background} orgAccent={orgColour} brandColours={brandColours} documentColours={documentColours} onChange={(hex) => hex && update({ customColours: { ...custom, background: hex } })} /> : null}
          </>
        )}
      </Section>
      <Section title="Background picture">
        <Field label={background.imageUrl ? "Replace the picture" : "Picture"} helperText="Sits under every layer, for a printed border or a watermark. PNG, JPEG or WebP, up to 5 MB.">
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUploadBackground(file); event.target.value = ""; }} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-control file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
        </Field>
        {background.imageUrl ? (
          <>
            <SegmentedControl<CardBackground["fit"]> ariaLabel="Background fit" size="sm" value={background.fit} onValueChange={(fit) => setBackground({ fit })} options={[{ value: "cover", label: "Fill the page" }, { value: "contain", label: "Show it all" }]} className="self-start" />
            <NumberSlider label="Strength" unit="%" min={5} max={100} step={1} value={background.opacityPct} onChange={(opacityPct) => setBackground({ opacityPct })} />
            <Button size="sm" variant="quiet" className="self-start" onClick={() => setBackground({ imageUrl: null })}>Remove the picture</Button>
          </>
        ) : null}
      </Section>
    </>
  );
}
