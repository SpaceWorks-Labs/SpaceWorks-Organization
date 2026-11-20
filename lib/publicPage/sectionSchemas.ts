import { z } from "zod";
import { isMapLink, videoEmbed } from "./embeds";
import { isSafeLink, PAGE_FILE_KEY, PAGE_IMAGE_KEY } from "./links";

/**
 * One zod object per public page section type, with its limits. Text is plain (or the Markdown subset in
 * lib/publicPage/markdown.ts) and rendered as React text; links pass isSafeLink; images are page-image upload keys
 * (lib/publicPage/server.ts then checks they are this organisation's and still stored). Pure and client-safe.
 */

const text = (max: number) => z.string().trim().max(max);
const optional = (max: number) => text(max).optional().default("");
const title = text(80).default("");
const sectionId = z.string().regex(/^[a-z0-9]{6,16}$/);
const imageKey = z.string().regex(PAGE_IMAGE_KEY, "Upload the image again");
const optionalImage = imageKey.nullable().default(null);
/** A download is one of the organisation's page images or PDFs. */
const downloadKey = z.string().refine((key) => PAGE_IMAGE_KEY.test(key) || PAGE_FILE_KEY.test(key), "Upload the file again");
const link = z.string().trim().max(500).refine(isSafeLink, "Use a web address starting with https://, or mailto:");
const optionalLink = z.string().trim().max(500).refine((value) => value === "" || isSafeLink(value), "Use a web address starting with https://, or mailto:").default("");
const required = (max: number, message: string) => text(max).min(1, message);

const base = { id: sectionId, visible: z.boolean().default(true), title };

export const LINK_KINDS = ["website", "instagram", "facebook", "x", "linkedin", "youtube", "github", "whatsapp", "other"] as const;
export const MAX_GALLERY_IMAGES = 12;

/** A button: to a plan's join page (or the plans when none is chosen), to the plans section, or a web link. */
export const ACTION_KINDS = ["none", "join", "plans", "link"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export const EMPTY_ACTION = { kind: "none", label: "", planSlug: "", url: "" } as const;

export const actionSchema = z
  .object({
    kind: z.enum(ACTION_KINDS).default("none"),
    label: text(40).default(""),
    planSlug: z.string().trim().max(64).regex(/^[a-z0-9-]*$/, "Choose a plan").default(""),
    url: optionalLink,
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "none" && !value.label) ctx.addIssue({ code: "custom", path: ["label"], message: "Name the button" });
    if (value.kind === "link" && !value.url) ctx.addIssue({ code: "custom", path: ["url"], message: "Add the web address" });
  });
export type PageAction = z.infer<typeof actionSchema>;
const action = actionSchema.default({ ...EMPTY_ACTION });

export const HERO_LAYOUTS = ["split", "centred", "cover"] as const;
export const CTA_TONES = ["accent", "ink", "plain"] as const;
export const IMAGE_SIDES = ["left", "right"] as const;

export const MAX_PEOPLE = 24;
export const MAX_TESTIMONIALS = 12;
export const MAX_TIMELINE = 24;
export const MAX_STATS = 8;
export const MAX_DOWNLOADS = 12;

const intro = optional(600);

export const SECTION_SCHEMAS = {
  hero: z.object({
    ...base,
    type: z.literal("hero"),
    headline: text(120).default(""),
    subtitle: optional(400),
    imageKey: optionalImage,
    imageAlt: optional(160),
    layout: z.enum(HERO_LAYOUTS).default("split"),
    primary: action,
    secondary: action,
  }),
  cta: z.object({ ...base, type: z.literal("cta"), headline: text(120).default(""), body: optional(400), tone: z.enum(CTA_TONES).default("accent"), primary: action, secondary: action }),
  counts: z.object({ ...base, type: z.literal("counts"), intro, total: z.boolean().default(true), byPlan: z.boolean().default(false), byUnit: z.boolean().default(false) }),
  card: z.object({ ...base, type: z.literal("card"), intro }),
  about: z.object({ ...base, type: z.literal("about"), markdown: text(6000).default("") }),
  plans: z.object({ ...base, type: z.literal("plans"), intro }),
  units: z.object({ ...base, type: z.literal("units"), intro }),
  committee: z.object({
    ...base,
    type: z.literal("committee"),
    intro,
    people: z.array(z.object({ name: required(80, "Write the name"), role: optional(80), photoKey: optionalImage, url: optionalLink })).max(MAX_PEOPLE).default([]),
  }),
  testimonials: z.object({
    ...base,
    type: z.literal("testimonials"),
    items: z.array(z.object({ quote: required(500, "Write the quote"), name: required(80, "Write who said it"), role: optional(80) })).max(MAX_TESTIMONIALS).default([]),
  }),
  timeline: z.object({
    ...base,
    type: z.literal("timeline"),
    items: z.array(z.object({ date: required(40, "Add a year or date"), title: required(120, "Write what happened"), body: optional(600) })).max(MAX_TIMELINE).default([]),
  }),
  stats: z.object({
    ...base,
    type: z.literal("stats"),
    items: z.array(z.object({ value: required(16, "Write the number"), label: required(60, "Say what it counts") })).max(MAX_STATS).default([]),
  }),
  imageText: z.object({ ...base, type: z.literal("imageText"), imageKey: optionalImage, imageAlt: optional(160), markdown: text(3000).default(""), side: z.enum(IMAGE_SIDES).default("left"), primary: action }),
  video: z.object({
    ...base,
    type: z.literal("video"),
    url: z.string().trim().max(500).refine((value) => value === "" || videoEmbed(value) !== null, "Use a YouTube or Vimeo link").default(""),
    caption: optional(200),
  }),
  gallery: z.object({ ...base, type: z.literal("gallery"), images: z.array(z.object({ key: imageKey, alt: text(160).default("") })).max(MAX_GALLERY_IMAGES).default([]) }),
  downloads: z.object({ ...base, type: z.literal("downloads"), intro, files: z.array(z.object({ key: downloadKey, label: required(80, "Name the file") })).max(MAX_DOWNLOADS).default([]) }),
  faq: z.object({ ...base, type: z.literal("faq"), items: z.array(z.object({ question: required(200, "Write the question"), answer: required(2000, "Write the answer") })).max(30).default([]) }),
  links: z.object({ ...base, type: z.literal("links"), links: z.array(z.object({ kind: z.enum(LINK_KINDS).default("other"), label: required(60, "Name the link"), url: link })).max(16).default([]) }),
  contact: z.object({
    ...base,
    type: z.literal("contact"),
    email: z.string().trim().toLowerCase().max(320).refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid email address").default(""),
    phone: z.string().trim().max(32).refine((value) => value === "" || /^[+0-9 ()-]{6,32}$/.test(value), "Enter a valid phone number").default(""),
    address: optional(400),
    hours: optional(200),
  }),
  map: z.object({
    ...base,
    type: z.literal("map"),
    address: optional(400),
    url: z.string().trim().max(500).refine((value) => value === "" || isMapLink(value), "Use a Google Maps, OpenStreetMap, Apple Maps or Bing Maps link").default(""),
    label: text(40).default("Open in maps"),
  }),
  text: z.object({ ...base, type: z.literal("text"), body: text(4000).default("") }),
};
