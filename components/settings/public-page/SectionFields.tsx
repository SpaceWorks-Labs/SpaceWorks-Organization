"use client";

import type { PageSection } from "@/lib/publicPage/sections";
import { AboutFields, ContactFields, FaqFields, LinksFields, MapFields, TextFields } from "./fields/InfoFields";
import { DownloadsFields, GalleryFields, ImageTextFields, VideoFields } from "./fields/MediaFields";
import { CardFields, CountsFields, IntroFields, StatsFields } from "./fields/MembershipFields";
import { CommitteeFields, TestimonialsFields, TimelineFields } from "./fields/PeopleFields";
import { CtaFields, HeroFields } from "./fields/WelcomeFields";
import type { FieldContext } from "./fields/shared";

/** The fields for one section, by type. Every value is validated again on the server when saved. */
export function SectionFields({ section, onChange, ...context }: FieldContext & { section: PageSection; onChange: (next: PageSection) => void }) {
  switch (section.type) {
    case "hero": return <HeroFields {...context} section={section} onChange={onChange} />;
    case "cta": return <CtaFields {...context} section={section} onChange={onChange} />;
    case "about": return <AboutFields {...context} section={section} onChange={onChange} />;
    case "plans": return <IntroFields intro={section.intro} disabled={context.disabled} error={context.error} onIntro={(intro) => onChange({ ...section, intro })} note="Your open plans and their prices show below it, always up to date." />;
    case "counts": return <CountsFields {...context} section={section} onChange={onChange} />;
    case "card": return <CardFields {...context} section={section} onChange={onChange} />;
    case "stats": return <StatsFields {...context} section={section} onChange={onChange} />;
    case "committee": return <CommitteeFields {...context} section={section} onChange={onChange} />;
    case "testimonials": return <TestimonialsFields {...context} section={section} onChange={onChange} />;
    case "timeline": return <TimelineFields {...context} section={section} onChange={onChange} />;
    case "imageText": return <ImageTextFields {...context} section={section} onChange={onChange} />;
    case "video": return <VideoFields {...context} section={section} onChange={onChange} />;
    case "gallery": return <GalleryFields {...context} section={section} onChange={onChange} />;
    case "downloads": return <DownloadsFields {...context} section={section} onChange={onChange} />;
    case "units": return <IntroFields intro={section.intro} disabled={context.disabled} error={context.error} onIntro={(intro) => onChange({ ...section, intro })} note="Your units show below it, from Settings → Units and roles." />;
    case "faq": return <FaqFields {...context} section={section} onChange={onChange} />;
    case "links": return <LinksFields {...context} section={section} onChange={onChange} />;
    case "contact": return <ContactFields {...context} section={section} onChange={onChange} />;
    case "map": return <MapFields {...context} section={section} onChange={onChange} />;
    case "text": return <TextFields {...context} section={section} onChange={onChange} />;
  }
}
