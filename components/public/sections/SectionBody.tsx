import { areasForSection, type AreaContext, type AreaEntry, type LiveStatsData } from "@/lib/publicPage/blockData";
import { actionHref, type PublicCounts, type SampleCard } from "@/lib/publicPage/live";
import { videoEmbed } from "@/lib/publicPage/embeds";
import type { PageSection } from "@/lib/publicPage/sections";
import { Markdown } from "@/components/public/Markdown";
import { PlanCards, type PublicPlan } from "@/components/public/PlanCards";
import { FaqList } from "@/components/public/FaqList";
import { Contact, contactIsEmpty, Links, MapLink, PlainText, Units, type PageUnit } from "./Information";
import { CallToAction, CardShowcase, Counts, countsToShow, Stats } from "./Membership";
import { Downloads, Gallery, ImageText, Video } from "./Media";
import { Committee, Testimonials, Timeline } from "./People";
import { HeroBlock } from "./PageTop";
import { Areas, Badges, Buttons, Columns, Divider, IconList, LiveStats, MembersPreview } from "./Blocks";
import { LEDE, PROSE, type ActionContext } from "./shared";

export type PageOrg = { name: string; slug: string; kind: string; logoUrl: string | null; locale: string | null; financialYearStartMonth: number; unitLevels: string[] };

/** Everything a page reads live beside its document. */
export type Live = {
  org: PageOrg;
  plans: PublicPlan[];
  units: PageUnit[];
  takingMembers: boolean;
  /** The editor's inert preview: nothing navigates, no outside frame loads, empty sections show a note. */
  preview: boolean;
  counts: PublicCounts | null;
  sampleCard: SampleCard | null;
  /** Figures for the numbers blocks, by section id (already scoped and suppressed). */
  liveStats?: LiveStatsData | null;
  /** Every area, for the areas directory. */
  areas?: AreaEntry[];
  /** Set on an area page: its join links carry the area's code. */
  area?: AreaContext | null;
};

/** Sections that carry their own heading (a headline) instead of the section title. */
export const SELF_HEADED = new Set<PageSection["type"]>(["hero", "cta"]);

/** Why a section has nothing to show, or null when it has. Visitors never see an empty section; the preview says why. */
export function emptyReason(section: PageSection, live: Live, context: ActionContext): string | null {
  switch (section.type) {
    case "hero": return section.headline || section.subtitle || section.imageKey || actionHref(section.primary, context) ? null : "Write a headline for this hero.";
    case "cta": return section.headline || section.body ? null : "Write a headline for this call to action.";
    case "counts": {
      const shown = countsToShow(section, live.counts);
      return shown.total !== null || shown.byPlan.length || shown.byUnit.length ? null : "Counts appear once you have at least 5 current members.";
    }
    case "card": return live.sampleCard ? null : "The sample card shows here: your approved design from Settings → Cards, or the built-in one.";
    case "about": return section.markdown ? null : "Nothing written yet.";
    case "plans": return null;
    case "units": return live.units.length ? null : "No units yet. Add them in Settings → Units and roles.";
    case "committee": return section.people.length ? null : "Add the people on your committee.";
    case "testimonials": return section.items.length ? null : "Add what members say.";
    case "timeline": return section.items.length ? null : "Add your first milestone.";
    case "stats": return section.items.length ? null : "Add a number and what it counts.";
    case "imageText": return section.imageKey || section.markdown ? null : "Add an image or some text.";
    case "video": return videoEmbed(section.url) ? null : "Add a YouTube or Vimeo link.";
    case "gallery": return section.images.length ? null : "No images yet.";
    case "downloads": return section.files.length ? null : "Upload a file people can download.";
    case "faq": return section.items.length ? null : "No questions yet.";
    case "links": return section.links.length ? null : "No links yet.";
    case "contact": return contactIsEmpty(section) ? "No contact details yet." : null;
    case "map": return section.address || section.url ? null : "Add your address and a maps link.";
    case "text": return section.body ? null : "Nothing written yet.";
    case "liveStats": return (live.liveStats?.[section.id] ?? []).some((result) => result.value !== null || result.rows.length) ? null : "Numbers appear once there are at least 5 current members to count. Add something to count first.";
    case "areas": return areasForSection(section, live.areas ?? [], live.area ?? null).length ? null : "No areas to list. Add them in Settings → Units and roles.";
    case "columns": return section.columns.some((column) => column.items.length) ? null : "Add a heading, some text or a button to a column.";
    case "buttons": return section.items.some((item) => actionHref(item, context)) ? null : "Add a button.";
    case "iconList": return section.items.length ? null : "Add your first point.";
    case "divider": return null;
    case "badges": return section.items.length ? null : "Add a badge.";
    case "membersPreview": return section.points.length || (section.showCard && live.sampleCard) ? null : "Add what members get after joining.";
  }
}

/** One section's content, by type. */
export function SectionBody({ section, live, context }: { section: PageSection; live: Live; context: ActionContext }) {
  switch (section.type) {
    case "hero": return <HeroBlock section={section} context={context} />;
    case "cta": return <CallToAction section={section} context={context} />;
    case "counts": return <Counts section={section} counts={live.counts} locale={live.org.locale} unitLabel={live.org.unitLevels[0] || "Unit"} />;
    case "card": return live.sampleCard ? <CardShowcase section={section} card={live.sampleCard} orgName={live.org.name} /> : null;
    case "about": return <div className={PROSE}><Markdown source={section.markdown} /></div>;
    case "plans":
      return (
        <div className="flex flex-col gap-6">
          {section.intro ? <p className={LEDE}>{section.intro}</p> : null}
          <PlanCards org={live.org} plans={live.plans} takingMembers={live.takingMembers} preview={live.preview} areaCode={live.area?.code ?? null} />
        </div>
      );
    case "units": return <Units units={live.units} intro={section.intro} />;
    case "committee": return <Committee section={section} />;
    case "testimonials": return <Testimonials section={section} />;
    case "timeline": return <Timeline section={section} />;
    case "stats": return <Stats section={section} />;
    case "imageText": return <ImageText section={section} context={context} />;
    case "video": return <Video section={section} preview={live.preview} />;
    case "gallery": return <Gallery section={section} />;
    case "downloads": return <Downloads section={section} />;
    case "faq": return <FaqList items={section.items} />;
    case "links": return <Links section={section} />;
    case "contact": return <Contact section={section} />;
    case "map": return <MapLink section={section} />;
    case "text": return <PlainText body={section.body} />;
    case "liveStats": return <LiveStats section={section} results={live.liveStats?.[section.id] ?? []} locale={live.org.locale} />;
    case "areas": return <Areas section={section} areas={live.areas ?? []} area={live.area ?? null} orgSlug={live.org.slug} preview={live.preview} />;
    case "columns": return <Columns section={section} context={context} />;
    case "buttons": return <Buttons section={section} context={context} />;
    case "iconList": return <IconList section={section} />;
    case "divider": return <Divider section={section} />;
    case "badges": return <Badges section={section} />;
    case "membersPreview": return <MembersPreview section={section} card={live.sampleCard} orgName={live.org.name} />;
  }
}
