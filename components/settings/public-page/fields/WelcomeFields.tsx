"use client";

import { Field, Input, Textarea } from "@/components/ui/field";
import { ActionFields } from "./ActionFields";
import { ChoiceCards, ImageField, type SectionProps } from "./shared";

const LAYOUTS = [
  { value: "split", label: "Split", description: "Text beside the photo" },
  { value: "centred", label: "Centred", description: "Text centred, photo below" },
  { value: "cover", label: "Cover", description: "A wide photo above the text" },
] as const;

const TONES = [
  { value: "accent", label: "Accent", description: "A soft band in your colour" },
  { value: "ink", label: "Dark", description: "A dark band" },
  { value: "plain", label: "Plain", description: "No band" },
] as const;

/** The hero: the page's big opening. As the first visible section it replaces the plain top (logo, name, tagline). */
export function HeroFields({ section, slug, plans, disabled, error, onChange }: SectionProps<"hero">) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-ink-muted">Put it first to replace the plain top of the page. Your logo and tagline stay in it; your logo never moves.</p>
      <Field label="Headline" optional helperText="Leave it empty to use your organisation's name." error={error("headline")}>
        <Input value={section.headline} maxLength={120} disabled={disabled} onChange={(event) => onChange({ ...section, headline: event.target.value })} />
      </Field>
      <Field label="Subtitle" optional helperText="A sentence or two about who you are and who can join." error={error("subtitle")}>
        <Textarea value={section.subtitle} rows={3} maxLength={400} disabled={disabled} onChange={(event) => onChange({ ...section, subtitle: event.target.value })} />
      </Field>
      <ChoiceCards label="Layout" value={section.layout} options={LAYOUTS} disabled={disabled} onChange={(layout) => onChange({ ...section, layout })} />
      <ImageField
        slug={slug}
        label="Photo"
        imageKey={section.imageKey}
        alt={section.imageAlt}
        aspect={section.layout === "cover" ? "aspect-[3/1]" : "aspect-[4/3]"}
        disabled={disabled}
        error={error("imageKey")}
        onChange={(next) => onChange({ ...section, imageKey: next.imageKey, imageAlt: next.alt ?? section.imageAlt })}
      />
      <ActionFields legend="Main button" value={section.primary} plans={plans} disabled={disabled} error={(path) => error(`primary.${path}`)} onChange={(primary) => onChange({ ...section, primary })} />
      <ActionFields legend="Second button" value={section.secondary} plans={plans} disabled={disabled} error={(path) => error(`secondary.${path}`)} onChange={(secondary) => onChange({ ...section, secondary })} />
    </div>
  );
}

/** A call to action: a short invitation with one or two buttons. */
export function CtaFields({ section, plans, disabled, error, onChange }: SectionProps<"cta">) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Headline" error={error("headline")}>
        <Input value={section.headline} maxLength={120} disabled={disabled} onChange={(event) => onChange({ ...section, headline: event.target.value })} />
      </Field>
      <Field label="Text" optional error={error("body")}>
        <Textarea value={section.body} rows={3} maxLength={400} disabled={disabled} onChange={(event) => onChange({ ...section, body: event.target.value })} />
      </Field>
      <ChoiceCards label="Style" value={section.tone} options={TONES} disabled={disabled} onChange={(tone) => onChange({ ...section, tone })} />
      <ActionFields legend="Main button" value={section.primary} plans={plans} disabled={disabled} error={(path) => error(`primary.${path}`)} onChange={(primary) => onChange({ ...section, primary })} />
      <ActionFields legend="Second button" value={section.secondary} plans={plans} disabled={disabled} error={(path) => error(`secondary.${path}`)} onChange={(secondary) => onChange({ ...section, secondary })} />
    </div>
  );
}
