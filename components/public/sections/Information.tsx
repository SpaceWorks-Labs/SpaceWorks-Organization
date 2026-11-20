import { ArrowUpRight, Clock, Globe, Link2, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { isExternalLink, type SectionOf } from "@/lib/publicPage/sections";
import { buttonClasses } from "@/components/ui/button";
import { externalProps, LEDE } from "./shared";

export type PageUnit = { id: string; name: string; level: number; parentId: string | null };

/** How people reach the organisation, in one panel. */
export function Contact({ section }: { section: SectionOf<"contact"> }) {
  const link = "underline-offset-4 hover:underline";
  const rows = [
    section.email ? { key: "Email", icon: Mail, value: <a className={link} href={`mailto:${section.email}`}>{section.email}</a> } : null,
    section.phone ? { key: "Phone", icon: Phone, value: <a className={link} href={`tel:${section.phone.replace(/[\s()-]/g, "")}`}>{section.phone}</a> } : null,
    section.address ? { key: "Address", icon: MapPin, value: <span className="whitespace-pre-wrap">{section.address}</span> } : null,
    section.hours ? { key: "Hours", icon: Clock, value: <span>{section.hours}</span> } : null,
  ].filter((row) => row !== null);
  return (
    <dl className="grid max-w-[860px] gap-x-8 gap-y-6 rounded-2xl border border-line bg-panel p-6 @xl:grid-cols-2 @xl:p-8">
      {rows.map((row) => (
        <div key={row.key} className="flex items-start gap-4">
          <dt className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
            <row.icon aria-hidden className="size-5" />
            <span className="sr-only">{row.key}</span>
          </dt>
          <dd className="min-w-0 self-center break-words text-body-ui text-ink [overflow-wrap:anywhere]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const contactIsEmpty = (section: SectionOf<"contact">) => !section.email && !section.phone && !section.address && !section.hours;

/** The organisation's top-level units, each with the names of the units below it. */
export function Units({ units, intro }: { units: PageUnit[]; intro: string }) {
  const top = units.filter((unit) => !unit.parentId || !units.some((other) => other.id === unit.parentId));
  return (
    <div className="flex flex-col gap-6">
      {intro ? <p className={LEDE}>{intro}</p> : null}
      <ul className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
        {top.map((unit) => {
          const children = units.filter((other) => other.parentId === unit.id);
          return (
            <li key={unit.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-6">
              <h3 className="text-h4 break-words text-ink">{unit.name}</h3>
              {children.length ? <p className="text-body-ui text-ink-secondary">{children.map((child) => child.name).join(" · ")}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const LINK_ICONS: Record<string, typeof Globe> = { website: Globe, whatsapp: MessageCircle };

/** The organisation's website and social profiles as large pill links. */
export function Links({ section }: { section: SectionOf<"links"> }) {
  return (
    <ul className="flex flex-wrap gap-3">
      {section.links.map((link, index) => {
        const Icon = LINK_ICONS[link.kind] ?? Link2;
        const external = isExternalLink(link.url);
        return (
          <li key={index} className="max-w-full">
            <a href={link.url} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-control border border-line-strong bg-panel px-4 text-label font-semibold text-ink hover:bg-accent-soft" {...externalProps(external)}>
              <Icon aria-hidden className="size-4 shrink-0 text-accent-text" />
              <span className="min-w-0 break-words py-2">{link.label}</span>
              {external ? <ArrowUpRight aria-hidden className="size-4 shrink-0 text-ink-muted" /> : null}
              {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** An address with a link that opens it in a maps app. Nothing is embedded: the map loads only if they follow it. */
export function MapLink({ section }: { section: SectionOf<"map"> }) {
  return (
    <div className="flex max-w-[720px] flex-col gap-5 rounded-2xl border border-line bg-panel p-6 @xl:flex-row @xl:items-center @xl:justify-between @xl:p-8">
      <div className="flex items-start gap-4">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"><MapPin className="size-5" /></span>
        {section.address ? <p className="self-center whitespace-pre-wrap break-words text-body-ui text-ink">{section.address}</p> : null}
      </div>
      {section.url ? (
        <a href={section.url} className={buttonClasses({ variant: "secondary", className: "shrink-0" })} {...externalProps(true)}>
          {section.label || "Open in maps"}
          <ArrowUpRight aria-hidden className="size-4" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  );
}

/** A plain block of text with its line breaks. */
export function PlainText({ body }: { body: string }) {
  return <p className={LEDE}>{body}</p>;
}
