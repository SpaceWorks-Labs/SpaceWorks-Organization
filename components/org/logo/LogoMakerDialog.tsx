"use client";

import { useState, useTransition } from "react";
import { saveGeneratedLogo } from "@/app/actions/media";
import { FontPicker } from "@/components/cards/designer/FontPicker";
import { CardFontFaces, cardFontStack } from "@/components/cards/cardFonts";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { buildLogoSvg } from "@/lib/logo/logoSvg";
import { LOGO_ICON_IDS, logoIconPath } from "@/lib/logo/icons";
import { DEFAULT_LOGO_SPEC, initialsFrom, LOGO_TEXT_MAX, validateLogoSpec, type LogoSpec } from "@/lib/logo/spec";
import { ColourChoice, IconChoice, LOGO_PRESET_COLOURS, ShapeChoice } from "./LogoMakerControls";

/** The logo at one size, drawn in the browser with the chosen card font (the server outlines the same text). */
function Preview({ spec, size, label }: { spec: LogoSpec; size: number; label?: string }) {
  const svg = buildLogoSvg(spec, { kind: "font", fontFamily: cardFontStack(spec.font) }, logoIconPath(spec.icon));
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0 [&>svg]:size-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Settings → Profile → "Make a logo": initials or a short name in a shape, two colours (presets or the brand
 * kit's), a card font and an optional icon, previewed live. "Use this logo" draws it on the server and returns
 * its URL for the profile form to save.
 */
export function LogoMakerDialog({ organisationSlug, organisationName, brandColours, open, onOpenChange, onMade }: {
  organisationSlug: string;
  organisationName: string;
  brandColours: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMade: (url: string) => void;
}) {
  const [spec, setSpec] = useState<LogoSpec>(() => ({ ...DEFAULT_LOGO_SPEC, text: initialsFrom(organisationName) }));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const check = validateLogoSpec(spec, LOGO_ICON_IDS);
  const colours = [...brandColours, ...LOGO_PRESET_COLOURS];
  const initials = initialsFrom(organisationName);
  const set = (patch: Partial<LogoSpec>) => {
    setError(null);
    setSpec((current) => ({ ...current, ...patch }));
  };

  function save() {
    if (!check.ok) return setError(check.error);
    startTransition(async () => {
      const result = await saveGeneratedLogo({ organisationSlug, spec: check.spec });
      if (!result.ok || !result.data) return setError(result.ok ? "The logo didn't save. Try again." : result.error);
      onMade(result.data.url);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <CardFontFaces fonts="all" />
        <DialogHeader title="Make a logo" description="A simple mark from your initials or a short name. You can upload a designed logo at any time instead." />
        <DialogBody className="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex min-w-0 flex-col gap-5">
            {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
            <Field label="Initials or short name" helperText={`Up to ${LOGO_TEXT_MAX} characters. Leave it empty for an icon on its own.`}>
              <Input value={spec.text} maxLength={LOGO_TEXT_MAX + 4} onChange={(event) => set({ text: event.target.value })} autoComplete="off" />
            </Field>
            {initials && initials !== spec.text ? (
              <div>
                <Button size="sm" variant="secondary" onClick={() => set({ text: initials })}>Use initials: {initials}</Button>
              </div>
            ) : null}
            <ShapeChoice value={spec.shape} onChange={(shape) => set({ shape })} />
            <ColourChoice label="Background" value={spec.background} colours={colours} onChange={(background) => set({ background })} />
            <ColourChoice label="Text and icon" value={spec.foreground} colours={colours} onChange={(foreground) => set({ foreground })} />
            <div className="flex flex-col gap-1.5">
              <span className="text-label text-ink">Font</span>
              <FontPicker value={spec.font} onChange={(font) => set({ font })} />
            </div>
            <IconChoice value={spec.icon} onChange={(icon) => set({ icon })} />
          </div>
          <aside aria-label="Preview" className="flex flex-col items-center gap-3 md:sticky md:top-0 md:self-start">
            <span className="text-overline text-ink-muted">Preview</span>
            <div className="rounded-xl border border-line bg-subtle p-4">
              <Preview spec={spec} size={180} label={`Logo preview: ${spec.text || "icon"}`} />
            </div>
            <div className="flex items-end gap-3" aria-hidden>
              <Preview spec={spec} size={64} />
              <Preview spec={spec} size={32} />
            </div>
            {!check.ok ? <p role="status" className="text-center text-caption text-danger-fg">{check.error}</p> : <p className="text-center text-caption text-ink-muted">Small sizes show how it reads in lists and on cards.</p>}
          </aside>
        </DialogBody>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!check.ok} loading={pending} loadingLabel="Saving logo" onClick={save}>Use this logo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
