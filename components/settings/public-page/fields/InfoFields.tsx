"use client";

import { isMapLink } from "@/lib/publicPage/embeds";
import { LINK_KINDS } from "@/lib/publicPage/sections";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { ItemList, type SectionProps } from "./shared";

const LINK_LABELS: Record<(typeof LINK_KINDS)[number], string> = {
  website: "Website", instagram: "Instagram", facebook: "Facebook", x: "X", linkedin: "LinkedIn", youtube: "YouTube", github: "GitHub", whatsapp: "WhatsApp", other: "Other",
};

export function AboutFields({ section, disabled, error, onChange }: SectionProps<"about">) {
  return (
    <Field label="Text" helperText="Markdown: ## heading, **bold**, *italic*, - lists, [link](https://…). HTML isn't allowed." error={error("markdown")}>
      <Textarea value={section.markdown} rows={8} maxLength={6000} disabled={disabled} onChange={(event) => onChange({ ...section, markdown: event.target.value })} />
    </Field>
  );
}

export function TextFields({ section, disabled, error, onChange }: SectionProps<"text">) {
  return (
    <Field label="Text" helperText="Plain text. Line breaks are kept." error={error("body")}>
      <Textarea value={section.body} rows={5} maxLength={4000} disabled={disabled} onChange={(event) => onChange({ ...section, body: event.target.value })} />
    </Field>
  );
}

export function FaqFields({ section, disabled, error, onChange }: SectionProps<"faq">) {
  return (
    <ItemList
      items={section.items}
      max={30}
      noun="question"
      addLabel="Add a question"
      empty="No questions yet."
      disabled={disabled}
      create={() => ({ question: "", answer: "" })}
      onChange={(items) => onChange({ ...section, items })}
    >
      {(item, index, set) => (
        <div className="flex flex-col gap-3">
          <Field label="Question" error={error(`items.${index}.question`)}>
            <Input value={item.question} maxLength={200} disabled={disabled} onChange={(event) => set({ question: event.target.value })} />
          </Field>
          <Field label="Answer" error={error(`items.${index}.answer`)}>
            <Textarea value={item.answer} rows={3} maxLength={2000} disabled={disabled} onChange={(event) => set({ answer: event.target.value })} />
          </Field>
        </div>
      )}
    </ItemList>
  );
}

export function LinksFields({ section, disabled, error, onChange }: SectionProps<"links">) {
  return (
    <ItemList
      items={section.links}
      max={16}
      noun="link"
      addLabel="Add a link"
      empty="No links yet."
      disabled={disabled}
      create={() => ({ kind: "website" as const, label: "Website", url: "" })}
      onChange={(links) => onChange({ ...section, links })}
    >
      {(link, index, set) => (
        <div className="grid items-start gap-3 sm:grid-cols-[150px_1fr_1fr]">
          <Field label="Kind">
            <Dropdown value={link.kind} disabled={disabled} onChange={(event) => set({ kind: event.target.value as typeof link.kind, label: link.label || LINK_LABELS[event.target.value as typeof link.kind] })}>
              {LINK_KINDS.map((kind) => <option key={kind} value={kind}>{LINK_LABELS[kind]}</option>)}
            </Dropdown>
          </Field>
          <Field label="Label" error={error(`links.${index}.label`)}><Input value={link.label} maxLength={60} disabled={disabled} onChange={(event) => set({ label: event.target.value })} /></Field>
          <Field label="Address" error={error(`links.${index}.url`)}><Input type="url" inputMode="url" value={link.url} maxLength={500} placeholder="https://" disabled={disabled} onChange={(event) => set({ url: event.target.value.trim() })} /></Field>
        </div>
      )}
    </ItemList>
  );
}

export function ContactFields({ section, disabled, error, onChange }: SectionProps<"contact">) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Email" optional error={error("email")}><Input type="email" autoComplete="off" value={section.email} maxLength={320} disabled={disabled} onChange={(event) => onChange({ ...section, email: event.target.value })} /></Field>
      <Field label="Phone" optional error={error("phone")}><Input type="tel" autoComplete="off" value={section.phone} maxLength={32} disabled={disabled} onChange={(event) => onChange({ ...section, phone: event.target.value })} /></Field>
      <Field label="Address" optional className="sm:col-span-2" error={error("address")}><Textarea value={section.address} rows={2} maxLength={400} disabled={disabled} onChange={(event) => onChange({ ...section, address: event.target.value })} /></Field>
      <Field label="Hours" optional className="sm:col-span-2" error={error("hours")}><Input value={section.hours} maxLength={200} placeholder="Saturdays, 10am to 4pm" disabled={disabled} onChange={(event) => onChange({ ...section, hours: event.target.value })} /></Field>
    </div>
  );
}

/** An address and a link out to a maps service. Nothing is embedded, so no map loads on the page. */
export function MapFields({ section, disabled, error, onChange }: SectionProps<"map">) {
  const local = section.url && !isMapLink(section.url) ? "Use a Google Maps, OpenStreetMap, Apple Maps or Bing Maps link." : undefined;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Address" optional error={error("address")}>
        <Textarea value={section.address} rows={3} maxLength={400} disabled={disabled} onChange={(event) => onChange({ ...section, address: event.target.value })} />
      </Field>
      <Field label="Maps link" optional helperText="Copy the share link from your maps app. Visitors open it there; no map loads on your page." error={error("url") ?? local}>
        <Input type="url" inputMode="url" value={section.url} maxLength={500} placeholder="https://maps.app.goo.gl/…" disabled={disabled} onChange={(event) => onChange({ ...section, url: event.target.value.trim() })} />
      </Field>
      <Field label="Button label" error={error("label")}>
        <Input value={section.label} maxLength={40} disabled={disabled} onChange={(event) => onChange({ ...section, label: event.target.value })} />
      </Field>
    </div>
  );
}
