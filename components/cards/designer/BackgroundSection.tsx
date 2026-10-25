"use client";

import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import type { CardBackground } from "@/lib/cards/design/layers";
import { NumberSlider, Section } from "./controls";

/** A picture behind everything on this side. The card colour is chosen under Colour. */
export function BackgroundSection({ value, uploading, onChange, onUpload }: { value: CardBackground; uploading: boolean; onChange: (next: CardBackground) => void; onUpload: (file: File) => void }) {
  return (
    <Section title="Background picture">
      <Field label={value.imageUrl ? "Replace the picture" : "Picture"} helperText="Sits under everything on this side. PNG, JPEG or WebP, up to 5 MB.">
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-full file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
      </Field>
      {value.imageUrl ? (
        <>
          <SegmentedControl<CardBackground["fit"]> ariaLabel="Background fit" size="sm" value={value.fit} onValueChange={(fit) => onChange({ ...value, fit })} options={[{ value: "cover", label: "Fill the card" }, { value: "contain", label: "Show it all" }]} className="self-start" />
          <NumberSlider label="Strength" unit="%" min={5} max={100} step={1} value={value.opacityPct} onChange={(opacityPct) => onChange({ ...value, opacityPct })} />
          <Button size="sm" variant="quiet" className="self-start" onClick={() => onChange({ ...value, imageUrl: null })}>Remove the picture</Button>
        </>
      ) : null}
    </Section>
  );
}
