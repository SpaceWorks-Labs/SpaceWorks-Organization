import { cardTemplateDesign, type CardTemplateId } from "@/lib/cards/design/templates";
import { formatCardNumberFrom } from "@/lib/cards/numbering";

/*
 * The member cards on the landing page: the Space Works team on SpaceWorks cards, as in the demo
 * (scripts/seed-team.mjs). Every card is the SpaceWorks organisation's, with the real Space Works symbol as its
 * logo and its SWK card numbers; each person has their own plan and one of the built-in designs, for variety.
 * One list feeds both scripts/render-landing-cards.ts, which draws each card's front with the product's own
 * renderer, and the landing section, so names, files and alt text never drift.
 */

export type SampleOrg = {
  slug: "spaceworks";
  name: string;
  /** The organisation colour the renderer gets for designs that use it. */
  accent: string;
  /** A card number pattern (lib/cards/numbering.ts) and the prefix it prints. */
  numberFormat: string;
  prefix: string;
  /** The logo drawn on the card, under public/. */
  logo: string;
};

export const SAMPLE_ORG: SampleOrg = {
  slug: "spaceworks", name: "SpaceWorks", accent: "#006E63", numberFormat: "{PREFIX}-{SEQ:4}", prefix: "SWK", logo: "/brand/logo/symbol.svg",
};

type SampleCardSpec = {
  person: string;
  name: string;
  title: string;
  plan: string;
  template: CardTemplateId;
  /** Their unit in the demo (scripts/seed-team.mjs). */
  unit: string;
  seq: number;
  /** The validity line as the card prints it ("31 Mar 2027" or "Lifetime"). */
  validUntil: string;
};

/** In the order the landing page shows them. */
const SPECS: SampleCardSpec[] = [
  { person: "abhiram", name: "Abhiram NJ", title: "Cloud Specialist", plan: "Core team", template: "midnight", unit: "Kozhikode", seq: 2, validUntil: "31 Mar 2027" },
  { person: "abdul-samad", name: "Abdul Samad MJ", title: "Full Stack Developer", plan: "Annual membership", template: "corporate-landscape", unit: "Thrissur", seq: 3, validUntil: "31 Mar 2027" },
  { person: "midlaj", name: "Midlaj C", title: "Backend Engineer", plan: "Student", template: "aurora", unit: "Kannur", seq: 4, validUntil: "30 Jun 2027" },
  { person: "shaan", name: "Shaan Shoukath", title: "Systems Engineer", plan: "Founding member", template: "kasavu", unit: "Kochi", seq: 1, validUntil: "Lifetime" },
  { person: "anin", name: "Anin Arafath", title: "App Developer", plan: "Core team", template: "badge-portrait", unit: "Thiruvananthapuram", seq: 6, validUntil: "31 Mar 2027" },
  { person: "ajzal", name: "Ajzal P", title: "Marketing Specialist", plan: "Annual membership", template: "minimal-landscape", unit: "Kozhikode", seq: 5, validUntil: "30 Sep 2027" },
];

/** The year the sample cards were issued, for patterns that print one. */
const ISSUE_YEAR = 2026;
/** The longest side of each published image, in pixels (the renderer draws 1011 × 638 at 300 dpi). */
export const SAMPLE_CARD_LONG_PX = 720;
const SHORT_PX = Math.round((SAMPLE_CARD_LONG_PX * 54) / 85.6);

export type SampleCard = SampleCardSpec & {
  id: string;
  organisation: SampleOrg;
  idNumber: string;
  orientation: "landscape" | "portrait";
  /** The published image, under public/. */
  image: string;
  width: number;
  height: number;
  alt: string;
};

export const SAMPLE_CARDS: SampleCard[] = SPECS.map((spec) => {
  const id = `${SAMPLE_ORG.slug}-${spec.person}`;
  const front = cardTemplateDesign(spec.template, { organisationName: SAMPLE_ORG.name, planName: spec.plan }).front;
  const portrait = front.heightMm > front.widthMm;
  return {
    ...spec,
    id,
    organisation: SAMPLE_ORG,
    idNumber: formatCardNumberFrom(SAMPLE_ORG.numberFormat, { prefix: SAMPLE_ORG.prefix, seq: spec.seq, memberNumber: spec.seq, year: ISSUE_YEAR }),
    orientation: portrait ? "portrait" : "landscape",
    image: `/landing/cards/${id}.webp`,
    width: portrait ? SHORT_PX : SAMPLE_CARD_LONG_PX,
    height: portrait ? SAMPLE_CARD_LONG_PX : SHORT_PX,
    alt: `SpaceWorks member card for ${spec.name}, ${spec.title}, drawn by Space Works Organization`,
  };
});
