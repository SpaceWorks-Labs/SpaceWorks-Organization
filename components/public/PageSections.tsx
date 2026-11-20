import { plansSectionId } from "@/lib/publicPage/live";
import { leadingHero, SECTION_LABELS, type PageDocument, type PageSection } from "@/lib/publicPage/sections";
import { LeadingHero, PageHero } from "@/components/public/sections/PageTop";
import { emptyReason, SectionBody, SELF_HEADED, type Live } from "@/components/public/sections/SectionBody";
import { EmptyNote, type ActionContext } from "@/components/public/sections/shared";
import { cn } from "@/lib/cn";

export type { PageOrg, Live as PageLive } from "@/components/public/sections/SectionBody";
export type { PageUnit } from "@/components/public/sections/Information";

/** One section with its heading. The heading carries `section-<id>` (the target of "plans" buttons). */
function Section({ section, live, context }: { section: PageSection; live: Live; context: ActionContext }) {
  const empty = emptyReason(section, live, context);
  if (empty && !live.preview) return null;
  const selfHeaded = SELF_HEADED.has(section.type);
  const headingId = section.title && !selfHeaded ? `section-${section.id}` : undefined;
  const labelledBy = headingId ?? (selfHeaded && "headline" in section && section.headline ? `heading-${section.id}` : undefined);
  // The sample card carries the organisation's logo, so its section never moves; it reveals its words alone.
  const still = section.type === "card";
  return (
    <section
      id={headingId ? undefined : `section-${section.id}`}
      data-reveal={still ? undefined : ""}
      data-route-enter={still ? undefined : ""}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : section.title || SECTION_LABELS[section.type].label}
      className="flex scroll-mt-6 flex-col gap-8"
    >
      {headingId ? <h2 id={headingId} className="max-w-[860px] text-display-m text-balance text-ink">{section.title}</h2> : null}
      {empty ? <EmptyNote>{empty}</EmptyNote> : <SectionBody section={section} live={live} context={context} />}
    </section>
  );
}

/**
 * A custom page's visible sections in order. Shared by /o/[slug] and the editor's live preview. The top (a leading
 * hero, or the plain cover, logo and name) holds the tenant logo and stays still; the sections enter with the route
 * and reveal once on scroll, which only happens inside the public page's template and RevealRoot, never in the
 * editor's preview. Empty sections are left out for visitors and explained in the preview.
 */
export function PageSections({ document, className, ...live }: { document: PageDocument; className?: string } & Live) {
  const hero = leadingHero(document);
  const context: ActionContext = {
    orgSlug: live.org.slug,
    plans: live.plans.map((plan) => ({ slug: plan.slug, joinMode: plan.joinMode })),
    takingMembers: live.takingMembers,
    plansSectionId: plansSectionId(document),
  };
  const sections = document.sections.filter((section) => section.visible && section !== hero);
  return (
    <div className={cn("sw-display-headings flex flex-col gap-20 @4xl:gap-28", className)}>
      {hero ? <LeadingHero section={hero} document={document} org={live.org} context={context} /> : <PageHero document={document} org={live.org} />}
      {sections.map((section) => <Section key={section.id} section={section} live={live} context={context} />)}
    </div>
  );
}
