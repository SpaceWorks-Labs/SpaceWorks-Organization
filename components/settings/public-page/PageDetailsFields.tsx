"use client";

import { CheckCircle2, AlertTriangle, Palette, X } from "lucide-react";
import { ACCENT_PRESETS } from "@/lib/theme/accent";
import { checkAccentContrast } from "@/lib/publicPage/contrast";
import { pageImageUrl, type PageDocument } from "@/lib/publicPage/sections";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { ImageUploadButton } from "./ImageUploadButton";

type Details = Pick<PageDocument, "tagline" | "coverAssetKey" | "accentColor">;

/** The page's tagline, accent colour (with its contrast check) and cover image. */
export function PageDetailsFields({ slug, value, fallbackAccent, disabled, errors, onChange }: {
  slug: string;
  value: Details;
  fallbackAccent: string;
  disabled: boolean;
  errors: Record<string, string[]>;
  onChange: (next: Partial<Details>) => void;
}) {
  const accent = value.accentColor ?? fallbackAccent;
  const check = checkAccentContrast(accent);
  const swatch = "inline-flex size-11 items-center justify-center rounded-full border-2 transition-colors duration-(--sw-dur-fast) ease-sw";

  return (
    <div className="flex flex-col gap-6">
      <Field label="Tagline" optional helperText="One line under your name, set in the accent typeface." error={errors.tagline?.[0]}>
        <Input value={value.tagline} maxLength={160} disabled={disabled} onChange={(event) => onChange({ tagline: event.target.value })} placeholder="Makers, builders and tinkerers of Kochi" />
      </Field>

      <fieldset className="flex flex-col gap-3" disabled={disabled}>
        <legend className="mb-1 text-label font-semibold text-ink">Accent colour</legend>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              aria-label={preset.name}
              aria-pressed={accent.toUpperCase() === preset.hex}
              className={cn(swatch, accent.toUpperCase() === preset.hex ? "border-ink" : "border-line")}
              onClick={() => onChange({ accentColor: preset.hex })}
            >
              <span aria-hidden className="size-6 rounded-full" style={{ backgroundColor: preset.hex }} />
            </button>
          ))}
          <ColorPicker
            value={value.accentColor ?? ""}
            defaultColor={fallbackAccent}
            onChange={(hex) => onChange({ accentColor: hex })}
            label="Custom accent colour"
            trigger={<Button type="button" size="sm" variant="secondary"><Palette aria-hidden className="size-4" />Custom</Button>}
          />
          {value.accentColor ? <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ accentColor: null })}>Use the organisation&apos;s colour</Button> : null}
        </div>
        <p role="status" className={cn("flex items-start gap-2 text-caption", check.level === "pass" ? "text-success-fg" : "text-warning-fg")}>
          {check.level === "pass" ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />}
          <span>
            {check.level === "pass" && `Reads well. Buttons ${check.light}:1 against the page, labels ${check.label}:1.`}
            {check.level === "warn" && `Buttons fade into the light page (${check.light}:1, aim for 3:1). Text in the accent is darkened automatically; consider a deeper colour.`}
            {check.level === "fail" && `Button labels can't be read on this colour (${check.label}:1). Choose another.`}
          </span>
        </p>
        {errors.accentColor?.[0] ? <p role="alert" className="text-caption text-danger-fg">{errors.accentColor[0]}</p> : null}
      </fieldset>

      <div className="flex flex-col gap-3">
        <p className="text-label font-semibold text-ink">Cover image</p>
        {value.coverAssetKey ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded through the app's own storage route */}
            <img src={pageImageUrl(value.coverAssetKey)} alt="Cover preview" className="aspect-[3/1] w-full rounded-xl border border-line object-cover" />
          </div>
        ) : <p className="text-body-ui text-ink-muted">No cover. A wide photo of your people or place works best (3:1).</p>}
        <div className="flex flex-wrap items-center gap-2">
          <ImageUploadButton slug={slug} label={value.coverAssetKey ? "Replace cover" : "Upload cover"} disabled={disabled} onUploaded={(key) => onChange({ coverAssetKey: key })} />
          {value.coverAssetKey ? <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange({ coverAssetKey: null })}><X aria-hidden className="size-4" />Remove cover</Button> : null}
        </div>
      </div>
    </div>
  );
}
