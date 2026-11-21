import { newSection, newSectionId } from "./defaults";
import { EMPTY_ACTION } from "./sectionSchemas";
import type { PageDocument, PageSection, SectionOf, SectionType } from "./sections";

/**
 * Starting layouts for the public page editor. A template fills the draft with sections in a sensible order and
 * placeholder copy (en-GB, sentence case, never a real organisation's or person's name) that the organisation then
 * rewrites. Applying one replaces the sections and keeps the accent colour and cover. Pure and client-safe.
 */

export type TemplateId = "club" | "alumni" | "professional" | "community" | "sports" | "cultural";

type Org = { name: string; description: string; contactEmail: string | null; contactPhone: string | null };

type Template = {
  id: TemplateId;
  label: string;
  description: string;
  tagline: string;
  hero: { headline: string; subtitle: string; layout: SectionOf<"hero">["layout"] };
  about: string;
  /** The middle of the page, after hero, about and plans. Contact (and the closing call to action) always end it. */
  middle: Array<{ type: SectionType; patch?: Record<string, unknown> }>;
  faq: Array<{ question: string; answer: string }>;
  cta: { headline: string; body: string };
};

const counts = { type: "counts" as const, patch: { title: "Our members", total: true } };
const card = { type: "card" as const };

const TEMPLATES: Template[] = [
  {
    id: "club",
    label: "Club",
    description: "A friendly club page: who you are, your plans, the committee and how to reach you.",
    tagline: "Good company, every week",
    hero: { headline: "A club for people who like doing things together", subtitle: "Meet-ups, outings and a friendly crowd. Join for a year and come along to everything.", layout: "split" },
    about: "## Who we are\nWe are a members' club run by volunteers. Write a few lines about how you started and what a usual month looks like.\n\n- Regular meet-ups\n- Trips and outings\n- A say in how the club is run",
    middle: [counts, { type: "membersPreview" }, { type: "committee", patch: { title: "Committee" } }, { type: "gallery", patch: { title: "Club life" } }],
    faq: [
      { question: "Who can join?", answer: "Anyone who agrees to the club rules. Say here if there are age or area limits." },
      { question: "When do you meet?", answer: "Write your usual day, time and place." },
    ],
    cta: { headline: "Come along", body: "Join today and we'll see you at the next meet-up." },
  },
  {
    id: "alumni",
    label: "Alumni association",
    description: "For former students: a timeline of your story, office bearers, chapters and what members say.",
    tagline: "Once a student, always part of it",
    hero: { headline: "Stay connected with the people you studied with", subtitle: "Reunions, mentoring and a network that keeps growing. Membership keeps you in touch.", layout: "cover" },
    about: "## Our association\nTell people when the association began, who can join and what it does for alumni and current students.",
    middle: [{ type: "timeline", patch: { title: "Our story" } }, counts, { type: "membersPreview" }, { type: "committee", patch: { title: "Office bearers" } }, { type: "units", patch: { title: "Chapters" } }, { type: "testimonials" }],
    faq: [
      { question: "Who counts as an alumnus?", answer: "Say which years, courses or campuses can join." },
      { question: "Is there a life membership?", answer: "Explain your plans here; they are listed above with their prices." },
    ],
    cta: { headline: "Reconnect with your batch", body: "Join the association and hear about the next reunion first." },
  },
  {
    id: "professional",
    label: "Professional association",
    description: "A formal page for a professional body: standards, numbers, the council and member cards.",
    tagline: "Raising the standard of the profession",
    hero: { headline: "The professional body for our field", subtitle: "Recognition, training and a voice for members. Membership is open to qualified practitioners and students.", layout: "split" },
    about: "## What we do\nDescribe your purpose, the standards members agree to and the support you offer.\n\n1. Continuing professional development\n2. Events and conferences\n3. Representation and guidance",
    middle: [{ type: "stats", patch: { title: "In numbers" } }, card, { type: "committee", patch: { title: "Council" } }, { type: "downloads", patch: { title: "Documents" } }],
    faq: [
      { question: "What do I need to join?", answer: "List the qualifications or experience each plan needs." },
      { question: "How do members prove membership?", answer: "Every member gets a card with a QR code that anyone can check." },
    ],
    cta: { headline: "Join the profession's community", body: "Choose the plan that matches your qualifications." },
  },
  {
    id: "community",
    label: "Makerspace or community",
    description: "A hands-on space: what people make, a video tour, live counts and where to find you.",
    tagline: "Make things with your neighbours",
    hero: { headline: "A shared space to make, fix and learn", subtitle: "Tools, workshops and people who are happy to help. Members get access and a say in what we build next.", layout: "centred" },
    about: "## The space\nSay what tools and rooms members can use, when you are open and how inductions work.",
    middle: [{ type: "imageText", patch: { title: "What members make", markdown: "Write about a few projects members have made, and add a photo." } }, { type: "video", patch: { title: "Take the tour" } }, counts, card, { type: "map" }],
    faq: [
      { question: "Do I need experience?", answer: "No. Inductions cover safety and every tool you want to use." },
      { question: "Can I visit before joining?", answer: "Say when your open evenings are." },
    ],
    cta: { headline: "Start making", body: "Join, book an induction and bring your first project." },
  },
  {
    id: "sports",
    label: "Sports club",
    description: "Teams, sessions and results: numbers, a gallery, the committee and where you play.",
    tagline: "Train hard, play fair",
    hero: { headline: "Play, train and compete with us", subtitle: "Sessions for every level, from first-timers to league teams.", layout: "cover" },
    about: "## The club\nWrite about your teams, training sessions and the leagues you play in.",
    middle: [{ type: "stats", patch: { title: "The club in numbers" } }, { type: "gallery", patch: { title: "Match days" } }, { type: "committee", patch: { title: "Committee and coaches" } }, { type: "map", patch: { title: "Where we play" } }],
    faq: [
      { question: "Can beginners join?", answer: "Yes. Say which sessions suit new players." },
      { question: "What does membership cover?", answer: "List what each plan includes, such as training, kit or match fees." },
    ],
    cta: { headline: "Join the squad", body: "Sign up and come to your first session this week." },
  },
  {
    id: "cultural",
    label: "Cultural society",
    description: "Arts, heritage or language: your story, events in pictures, testimonials and links.",
    tagline: "Keeping our culture alive together",
    hero: { headline: "Celebrate, learn and share our culture", subtitle: "Festivals, classes and gatherings for members and their families.", layout: "split" },
    about: "## About the society\nTell people what the society celebrates, who it brings together and how members take part.",
    middle: [{ type: "timeline", patch: { title: "Our journey" } }, { type: "gallery", patch: { title: "Moments" } }, { type: "testimonials" }, { type: "links" }],
    faq: [
      { question: "Do I need to speak the language?", answer: "Say who is welcome and what classes you run." },
      { question: "Can my family join?", answer: "Explain your family or household plans here." },
    ],
    cta: { headline: "Be part of the society", body: "Join to hear about festivals, classes and gatherings first." },
  },
];

export const PAGE_TEMPLATES: ReadonlyArray<{ id: TemplateId; label: string; description: string }> = TEMPLATES.map(({ id, label, description }) => ({ id, label, description }));

/** Whether applying a template would replace anything: the editor asks first when it would. */
export function documentHasContent(document: PageDocument): boolean {
  return document.sections.length > 0 || Boolean(document.tagline) || Boolean(document.coverAssetKey);
}

function section(type: SectionType, makeId: () => string, org: Org, patch: Record<string, unknown> = {}): PageSection {
  return { ...newSection(type, makeId(), org), ...patch } as PageSection;
}

/** A template's sections for this organisation. Accent and cover stay; an empty tagline takes the template's. */
export function templateDocument(id: TemplateId, current: PageDocument, org: Org, makeId: () => string = () => newSectionId()): PageDocument {
  const template = TEMPLATES.find((one) => one.id === id) ?? TEMPLATES[0]!;
  const hero = section("hero", makeId, org, { headline: template.hero.headline, subtitle: template.hero.subtitle, layout: template.hero.layout });
  const about = section("about", makeId, org, { markdown: org.description.trim() || template.about });
  const plans = section("plans", makeId, org);
  const middle = template.middle.map((one) => section(one.type, makeId, org, one.patch));
  const faq = section("faq", makeId, org, { items: template.faq });
  const cta = section("cta", makeId, org, { headline: template.cta.headline, body: template.cta.body, primary: { ...EMPTY_ACTION, kind: "plans", label: "Become a member" } });
  const contact = section("contact", makeId, org);
  return { ...current, tagline: current.tagline || template.tagline, sections: [hero, about, plans, ...middle, faq, cta, contact] };
}
