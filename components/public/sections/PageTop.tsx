import { pageImageUrl, type PageDocument, type SectionOf } from "@/lib/publicPage/sections";
import { Chip, OrgLogo } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { ActionRow, LEDE, type ActionContext } from "./shared";

/** The organisation fields the top of a page shows. */
export type TopOrg = { name: string; kind: string; logoUrl: string | null };

/*
 * The top of a custom page. It holds the tenant logo, so the whole block stays still: no data-reveal, no route
 * movement (tenant logos never animate, CR-MOTION-01). The tagline is the layout's one Unbounded phrase.
 */

function Identity({ org, centred }: { org: TopOrg; centred?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", centred && "justify-center")}>
      <div data-tenant-logo className="w-fit"><OrgLogo name={org.name} src={org.logoUrl} size="lg" /></div>
      {org.kind ? <Chip tone="outline">{org.kind}</Chip> : null}
    </div>
  );
}

function Tagline({ text, centred }: { text: string; centred?: boolean }) {
  return text ? <p className={cn("font-accent text-h3 font-medium text-balance text-accent-text", centred && "mx-auto")}>{text}</p> : null;
}

/** The plain top when the page has no leading hero: cover, logo, name and tagline. */
export function PageHero({ document, org }: { document: Pick<PageDocument, "tagline" | "coverAssetKey">; org: TopOrg }) {
  return (
    <section aria-labelledby="org-name" className="flex flex-col gap-8">
      {document.coverAssetKey ? (
        // eslint-disable-next-line @next/next/no-img-element -- cover images are served by the app's own upload route
        <img src={pageImageUrl(document.coverAssetKey)} alt="" width={1200} height={400} className="aspect-[16/9] w-full rounded-2xl border border-line object-cover @xl:aspect-[3/1]" />
      ) : null}
      <div className="flex max-w-[760px] flex-col gap-5">
        <div data-tenant-logo className="w-fit"><OrgLogo name={org.name} src={org.logoUrl} size="xl" /></div>
        <div className="flex flex-col gap-3">
          {org.kind ? <Chip tone="outline" className="w-fit">{org.kind}</Chip> : null}
          <h1 id="org-name" className="text-display-xl text-balance text-ink">{org.name}</h1>
          <Tagline text={document.tagline} />
        </div>
      </div>
    </section>
  );
}

const TITLE = "text-display-xl text-balance text-ink";

/** The hero section leading the page: the h1, the tagline, a line about the organisation, buttons and a photo. */
export function LeadingHero({ section, document, org, context }: { section: SectionOf<"hero">; document: Pick<PageDocument, "tagline" | "coverAssetKey">; org: TopOrg; context: ActionContext }) {
  const imageKey = section.imageKey ?? document.coverAssetKey;
  const image = imageKey ? { src: pageImageUrl(imageKey), alt: section.imageAlt } : null;
  const headline = section.headline || org.name;
  const subtitle = section.subtitle ? <p className={cn(LEDE, section.layout === "centred" && "mx-auto")}>{section.subtitle}</p> : null;
  const actions = <ActionRow primary={section.primary} secondary={section.secondary} context={context} className={section.layout === "centred" ? "justify-center" : undefined} />;
  const heading = (
    <h1 id="org-name" className={TITLE}>
      {headline}
      {section.headline && section.headline !== org.name ? <span className="sr-only"> · {org.name}</span> : null}
    </h1>
  );

  if (section.layout === "centred") {
    return (
      <section id={`section-${section.id}`} aria-labelledby="org-name" className="flex flex-col items-center gap-10 py-4 text-center @xl:py-10">
        <div className="flex max-w-[860px] flex-col items-center gap-6">
          <Identity org={org} centred />
          {heading}
          <Tagline text={document.tagline} centred />
          {subtitle}
          {actions}
        </div>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- page images are served by the app's own upload route
          <img src={image.src} alt={image.alt} width={1200} height={500} className="aspect-[16/9] w-full rounded-2xl border border-line object-cover @xl:aspect-[12/5]" />
        ) : null}
      </section>
    );
  }

  if (section.layout === "cover") {
    return (
      <section id={`section-${section.id}`} aria-labelledby="org-name" className="flex flex-col gap-8">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- page images are served by the app's own upload route
          <img src={image.src} alt={image.alt} width={1200} height={400} className="aspect-[4/3] w-full rounded-2xl border border-line object-cover @xl:aspect-[3/1]" />
        ) : null}
        <div className="flex max-w-[860px] flex-col gap-6">
          <Identity org={org} />
          {heading}
          <Tagline text={document.tagline} />
          {subtitle}
          {actions}
        </div>
      </section>
    );
  }

  return (
    <section id={`section-${section.id}`} aria-labelledby="org-name" className={cn("grid items-center gap-10 py-2 @xl:py-6", image && "@4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @4xl:gap-14")}>
      <div className="flex max-w-[760px] flex-col gap-6">
        <Identity org={org} />
        {heading}
        <Tagline text={document.tagline} />
        {subtitle}
        {actions}
      </div>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- page images are served by the app's own upload route
        <img src={image.src} alt={image.alt} width={800} height={600} className="aspect-[4/3] w-full rounded-2xl border border-line object-cover" />
      ) : null}
    </section>
  );
}

/** A hero placed lower down (only the first visible section leads): a large h2 with its buttons and photo. */
export function HeroBlock({ section, context }: { section: SectionOf<"hero">; context: ActionContext }) {
  const image = section.imageKey ? pageImageUrl(section.imageKey) : null;
  return (
    <div className={cn("grid items-center gap-8", image && "@4xl:grid-cols-2 @4xl:gap-14")}>
      <div className="flex flex-col gap-5">
        {section.headline ? <h2 id={`heading-${section.id}`} className="text-display-m text-balance text-ink">{section.headline}</h2> : null}
        {section.subtitle ? <p className={LEDE}>{section.subtitle}</p> : null}
        <ActionRow primary={section.primary} secondary={section.secondary} context={context} />
      </div>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- page images are served by the app's own upload route
        <img src={image} alt={section.imageAlt} width={800} height={600} loading="lazy" className="aspect-[4/3] w-full rounded-2xl border border-line object-cover" />
      ) : null}
    </div>
  );
}
