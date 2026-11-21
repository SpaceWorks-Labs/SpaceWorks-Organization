import Link from "next/link";
import { ArrowRight, Globe, Mail, Phone } from "lucide-react";
import { areaJoinHref, areasForSection, type AreaContext, type AreaEntry } from "@/lib/publicPage/blockData";
import type { SectionOf } from "@/lib/publicPage/sections";
import { buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { LEDE, externalProps } from "../shared";

/*
 * The areas directory: a card per area with its level, the contact it inherits, a join link set to it and a link to
 * its own page. In the editor's preview nothing navigates, so links draw as plain text with the same look.
 */

const LINK = "rounded-sm underline-offset-4 hover:text-ink hover:underline";

function ContactLines({ contact }: { contact: AreaEntry["contact"] }) {
  const { email, phone, website } = contact;
  if (!email && !phone && !website) return null;
  const row = "flex min-w-0 items-start gap-2.5";
  const icon = "mt-1 size-4 shrink-0 text-ink-muted";
  return (
    <ul className="flex flex-col gap-2 text-body-ui text-ink-secondary">
      {email ? <li className={row}><Mail aria-hidden className={icon} /><a className={`${LINK} min-w-0 [overflow-wrap:anywhere]`} href={`mailto:${email}`}><span className="sr-only">Email </span>{email}</a></li> : null}
      {phone ? <li className={row}><Phone aria-hidden className={icon} /><a className={LINK} href={`tel:${phone.replace(/[\s()-]/g, "")}`}><span className="sr-only">Phone </span>{phone}</a></li> : null}
      {website ? (
        <li className={row}>
          <Globe aria-hidden className={icon} />
          <a className={`${LINK} min-w-0 [overflow-wrap:anywhere]`} href={website} {...externalProps(true)}>
            <span className="sr-only">Website </span>{website.replace(/^https?:\/\//, "").replace(/\/$/, "")}<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ) : null}
    </ul>
  );
}

function AreaCard({ entry, section, orgSlug, preview }: { entry: AreaEntry; section: SectionOf<"areas">; orgSlug: string; preview: boolean }) {
  const join = section.showJoinLink ? areaJoinHref(entry, section, orgSlug) : null;
  const joinLabel = `Join in ${entry.name}`;
  const visit = (
    <>
      Visit page<span className="sr-only"> for {entry.name}</span>
      <ArrowRight aria-hidden className="size-4" />
    </>
  );
  const visitClass = buttonClasses({ variant: "secondary" });
  return (
    <li className="flex min-w-0 flex-col gap-5 rounded-xl border border-line bg-panel p-6">
      <div className="flex flex-col gap-2">
        {entry.levelLabel ? <Chip tone="outline" size="sm" className="w-fit">{entry.levelLabel}</Chip> : null}
        <h3 className="text-h4 [overflow-wrap:anywhere] text-ink">
          {preview ? entry.name : <Link href={entry.pageHref} className={LINK}>{entry.name}</Link>}
        </h3>
      </div>
      {section.showContact ? <ContactLines contact={entry.contact} /> : null}
      <div className="mt-auto flex flex-wrap gap-3">
        {join ? (preview ? <span className={buttonClasses({ variant: "accent" })}>{joinLabel}</span> : <Link href={join} className={buttonClasses({ variant: "accent" })}>{joinLabel}</Link>) : null}
        {preview ? <span className={visitClass}>{visit}</span> : <Link href={entry.pageHref} className={visitClass}>{visit}</Link>}
      </div>
    </li>
  );
}

/** The areas listed for the page (top level, below `parentCode`, or the current area's own sub-areas). */
export function Areas({ section, areas, area, orgSlug, preview }: { section: SectionOf<"areas">; areas: AreaEntry[]; area: AreaContext | null; orgSlug: string; preview: boolean }) {
  const listed = areasForSection(section, areas, area);
  return (
    <div className="flex flex-col gap-6">
      {section.intro ? <p className={LEDE}>{section.intro}</p> : null}
      <ul className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
        {listed.map((entry) => <AreaCard key={entry.id} entry={entry} section={section} orgSlug={orgSlug} preview={preview} />)}
      </ul>
    </div>
  );
}
