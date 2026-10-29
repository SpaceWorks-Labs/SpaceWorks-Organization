import { ArrowUpRight, Clock, Globe, Link2, Mail, MapPin, MessageCircle, Phone, Plus } from "lucide-react";
import { pageImageUrl, SECTION_LABELS, type PageDocument, type PageSection, type SectionOf } from "@/lib/publicPage/sections";
import { Markdown } from "@/components/public/Markdown";
import { PlanCards, type PublicPlan } from "@/components/public/PlanCards";
import { Chip, OrgLogo } from "@/components/ui/display";

export type PageOrg = { name: string; slug: string; kind: string; logoUrl: string | null; locale: string | null; financialYearStartMonth: number; unitLevels: string[] };
export type PageUnit = { id: string; name: string; level: number; parentId: string | null };
type Live = { org: PageOrg; plans: PublicPlan[]; units: PageUnit[]; takingMembers: boolean; preview: boolean };

/** The top of a custom page: cover, logo, name and tagline. The tagline is the layout's one Unbounded phrase. */
function PageHero({ document, org }: { document: Pick<PageDocument, "tagline" | "coverAssetKey">; org: PageOrg }) {
  return (
    <section aria-labelledby="org-name" className="flex flex-col gap-8">
      {document.coverAssetKey ? (
        // eslint-disable-next-line @next/next/no-img-element -- cover images are served by the app's own upload route
        <img src={pageImageUrl(document.coverAssetKey)} alt="" className="aspect-[16/9] w-full rounded-2xl border border-line object-cover sm:aspect-[3/1]" />
      ) : null}
      <div className="flex max-w-[760px] flex-col gap-5">
        <OrgLogo name={org.name} src={org.logoUrl} size="xl" />
        <div className="flex flex-col gap-3">
          {org.kind ? <Chip tone="outline" className="w-fit">{org.kind}</Chip> : null}
          <h1 id="org-name" className="text-display-m text-balance text-ink">{org.name}</h1>
          {document.tagline ? <p className="font-accent text-h3 font-medium text-balance text-accent-text">{document.tagline}</p> : null}
        </div>
      </div>
    </section>
  );
}

function Contact({ section }: { section: SectionOf<"contact"> }) {
  const rows = [
    section.email ? { icon: <Mail aria-label="Email" className="size-4" />, value: <a className="underline-offset-4 hover:underline" href={`mailto:${section.email}`}>{section.email}</a> } : null,
    section.phone ? { icon: <Phone aria-label="Phone" className="size-4" />, value: <a className="underline-offset-4 hover:underline" href={`tel:${section.phone.replace(/[\s()-]/g, "")}`}>{section.phone}</a> } : null,
    section.address ? { icon: <MapPin aria-label="Address" className="size-4" />, value: <span className="whitespace-pre-wrap">{section.address}</span> } : null,
    section.hours ? { icon: <Clock aria-label="Hours" className="size-4" />, value: <span>{section.hours}</span> } : null,
  ].filter((row) => row !== null);
  if (rows.length === 0) return <p className="text-body-ui text-ink-muted">No contact details yet.</p>;
  return (
    <dl className="grid max-w-[720px] gap-4 rounded-2xl border border-line bg-panel p-6 text-body-ui sm:grid-cols-2">
      {rows.map((row, index) => (
        <div key={index} className="flex items-start gap-3">
          <dt className="mt-1 text-ink-muted">{row.icon}</dt>
          <dd className="min-w-0 break-words text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Units({ units, intro }: { units: PageUnit[]; intro: string }) {
  const top = units.filter((unit) => !unit.parentId || !units.some((other) => other.id === unit.parentId));
  return (
    <div className="flex flex-col gap-5">
      {intro ? <p className="max-w-[720px] whitespace-pre-wrap text-body-l text-ink-secondary">{intro}</p> : null}
      {top.length === 0 ? <p className="text-body-ui text-ink-muted">No units yet.</p> : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top.map((unit) => {
            const children = units.filter((other) => other.parentId === unit.id);
            return (
              <li key={unit.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-5">
                <h3 className="text-h4 text-ink">{unit.name}</h3>
                {children.length ? <p className="text-body-ui text-ink-secondary">{children.map((child) => child.name).join(" · ")}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const LINK_ICONS: Record<string, typeof Globe> = { website: Globe, whatsapp: MessageCircle };

function SectionBody({ section, live }: { section: PageSection; live: Live }) {
  switch (section.type) {
    case "about":
      return section.markdown ? <div className="max-w-[720px]"><Markdown source={section.markdown} /></div> : <p className="text-body-ui text-ink-muted">Nothing written yet.</p>;
    case "plans":
      return (
        <div className="flex flex-col gap-5">
          {section.intro ? <p className="max-w-[720px] whitespace-pre-wrap text-body-l text-ink-secondary">{section.intro}</p> : null}
          <PlanCards org={live.org} plans={live.plans} takingMembers={live.takingMembers} preview={live.preview} />
        </div>
      );
    case "units":
      return <Units units={live.units} intro={section.intro} />;
    case "contact":
      return <Contact section={section} />;
    case "faq":
      return section.items.length === 0 ? <p className="text-body-ui text-ink-muted">No questions yet.</p> : (
        <div className="flex max-w-[760px] flex-col divide-y divide-line rounded-2xl border border-line bg-panel">
          {section.items.map((item, index) => (
            <details key={index} className="group px-5 py-4">
              <summary className="cursor-pointer list-none text-label font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-4">{item.question}<Plus aria-hidden className="size-5 shrink-0 text-ink-muted transition-transform duration-200 ease-sw group-open:rotate-45 motion-reduce:transition-none" /></span>
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-body-ui text-ink-secondary">{item.answer}</p>
            </details>
          ))}
        </div>
      );
    case "gallery":
      return section.images.length === 0 ? <p className="text-body-ui text-ink-muted">No images yet.</p> : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {section.images.map((image) => (
            <li key={image.key}>
              {/* eslint-disable-next-line @next/next/no-img-element -- gallery images are served by the app's own upload route */}
              <img src={pageImageUrl(image.key)} alt={image.alt} loading="lazy" className="aspect-[4/3] w-full rounded-xl border border-line object-cover" />
            </li>
          ))}
        </ul>
      );
    case "links":
      return section.links.length === 0 ? <p className="text-body-ui text-ink-muted">No links yet.</p> : (
        <ul className="flex flex-wrap gap-3">
          {section.links.map((link, index) => {
            const Icon = LINK_ICONS[link.kind] ?? Link2;
            const external = /^https?:/i.test(link.url);
            return (
              <li key={index}>
                <a href={link.url} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-panel px-4 text-label text-ink hover:bg-accent-soft" {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" } : {})}>
                  <Icon aria-hidden className="size-4 text-accent-text" />
                  {link.label}
                  {external ? <ArrowUpRight aria-hidden className="size-4 text-ink-muted" /> : null}
                </a>
              </li>
            );
          })}
        </ul>
      );
    case "text":
      return section.body ? <p className="max-w-[720px] whitespace-pre-wrap text-body-l text-ink-secondary">{section.body}</p> : <p className="text-body-ui text-ink-muted">Nothing written yet.</p>;
  }
}

/** A custom page's visible sections in order. Shared by /o/[slug] and the editor's live preview. */
export function PageSections({ document, ...live }: { document: PageDocument } & Live) {
  return (
    <div className="flex flex-col gap-14">
      <PageHero document={document} org={live.org} />
      {document.sections.filter((section) => section.visible).map((section) => (
        <section key={section.id} aria-labelledby={section.title ? `section-${section.id}` : undefined} aria-label={section.title ? undefined : SECTION_LABELS[section.type].label} className="flex flex-col gap-6">
          {section.title ? <h2 id={`section-${section.id}`} className="text-h1 text-ink">{section.title}</h2> : null}
          <SectionBody section={section} live={live} />
        </section>
      ))}
    </div>
  );
}
