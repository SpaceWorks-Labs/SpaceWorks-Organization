import { z } from "zod";
import { cardIcon } from "@/lib/cards/design/icons";
import { actionSchema } from "./sectionSchemas";
import { isSafeLink, PAGE_IMAGE_KEY } from "./links";

/**
 * The newer public page blocks: live numbers, the areas directory, layout elements (columns, button group, icon
 * list, divider, badges) and the members' area preview. Same rules as sectionSchemas.ts: plain text, links through
 * isSafeLink, images are page-image keys (checked against the organisation in server.ts), icons come from the card
 * editor's set. Pure and client-safe.
 */

const text = (max: number) => z.string().trim().max(max);
const optional = (max: number) => text(max).optional().default("");
const sectionId = z.string().regex(/^[a-z0-9]{6,16}$/);
const base = { id: sectionId, visible: z.boolean().default(true), title: text(80).default("") };
const optionalLink = z.string().trim().max(500).refine((value) => value === "" || isSafeLink(value), "Use a web address starting with https://, or mailto:").default("");
const required = (max: number, message: string) => text(max).min(1, message);
const iconId = z.string().trim().max(40).refine((id) => cardIcon(id) !== undefined, "Choose an icon from the list");

export const LIVE_STAT_KINDS = ["total", "joinsThisYear", "growth", "byArea", "byPlan", "byGrouping"] as const;
export type LiveStatKind = (typeof LIVE_STAT_KINDS)[number];
export const LIVE_STAT_DISPLAYS = ["numbers", "bars", "list"] as const;
export const GROWTH_DAYS = [30, 90, 365] as const;
export const MAX_LIVE_STATS = 8;
export const MAX_AREAS_SHOWN = 60;
export const MAX_COLUMN_ITEMS = 6;
export const MAX_BUTTONS = 6;
export const MAX_ICON_ITEMS = 12;
export const MAX_BADGES = 12;
export const MAX_PREVIEW_POINTS = 8;

export const LIVE_STAT_LABELS: Record<LiveStatKind, string> = {
  total: "Total members", joinsThisYear: "Joined this year", growth: "Growth over a period", byArea: "Members by area", byPlan: "Members by plan", byGrouping: "Members by grouping",
};

/** What a numbers block counts; `groupingId` is for "byGrouping", `days` for "growth". */
const liveStatMetric = z.object({
  kind: z.enum(LIVE_STAT_KINDS),
  label: optional(60),
  groupingId: z.string().trim().max(40).regex(/^[A-Za-z0-9]*$/, "Choose a grouping").default(""),
  days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90),
});

export const COLUMN_ITEM_TYPES = ["heading", "text", "button", "icon", "image"] as const;
const columnItem = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: required(120, "Write the heading"), level: z.union([z.literal(2), z.literal(3)]).default(3) }),
  z.object({ type: z.literal("text"), body: required(1200, "Write some text") }),
  z.object({ type: z.literal("button"), action: actionSchema }),
  z.object({ type: z.literal("icon"), icon: iconId, label: optional(80) }),
  z.object({ type: z.literal("image"), imageKey: z.string().regex(PAGE_IMAGE_KEY, "Upload the image again"), alt: optional(160) }),
]);
export type ColumnItem = z.infer<typeof columnItem>;

export const DIVIDER_VARIANTS = ["line", "dashed", "dots", "wave", "space"] as const;
export const SPACINGS = ["small", "medium", "large"] as const;
export const ALIGNS = ["start", "centre"] as const;

export const BLOCK_SCHEMAS = {
  liveStats: z.object({
    ...base,
    type: z.literal("liveStats"),
    intro: optional(600),
    display: z.enum(LIVE_STAT_DISPLAYS).default("numbers"),
    metrics: z.array(liveStatMetric).max(MAX_LIVE_STATS).default([]),
  }),
  areas: z.object({
    ...base,
    type: z.literal("areas"),
    intro: optional(600),
    /** The area whose sub-areas are listed, by code; empty lists from the top level (on an area page: that area's own sub-areas). */
    parentCode: z.string().trim().toUpperCase().max(6).regex(/^[A-Z0-9]*$/, "Use letters and numbers only").default(""),
    scope: z.enum(["level", "subtree"]).default("level"),
    showContact: z.boolean().default(true),
    showJoinLink: z.boolean().default(true),
    /** The plan the join links go to; empty picks the first open plan the area offers. */
    joinPlanSlug: z.string().trim().max(64).regex(/^[a-z0-9-]*$/, "Choose a plan").default(""),
  }),
  columns: z.object({
    ...base,
    type: z.literal("columns"),
    columns: z.array(z.object({ items: z.array(columnItem).max(MAX_COLUMN_ITEMS).default([]) })).min(2, "Use 2 to 4 columns").max(4, "Use 2 to 4 columns").default([{ items: [] }, { items: [] }]),
  }),
  buttons: z.object({ ...base, type: z.literal("buttons"), align: z.enum(ALIGNS).default("start"), items: z.array(actionSchema).max(MAX_BUTTONS).default([]) }),
  iconList: z.object({
    ...base,
    type: z.literal("iconList"),
    layout: z.enum(["list", "grid"]).default("grid"),
    items: z.array(z.object({ icon: iconId, title: required(80, "Write a title"), text: optional(300) })).max(MAX_ICON_ITEMS).default([]),
  }),
  divider: z.object({ ...base, type: z.literal("divider"), variant: z.enum(DIVIDER_VARIANTS).default("line"), spacing: z.enum(SPACINGS).default("medium") }),
  badges: z.object({
    ...base,
    type: z.literal("badges"),
    align: z.enum(ALIGNS).default("start"),
    items: z.array(z.object({ label: required(40, "Write the label"), icon: iconId.nullable().default(null), url: optionalLink })).max(MAX_BADGES).default([]),
  }),
  membersPreview: z.object({
    ...base,
    type: z.literal("membersPreview"),
    intro: optional(600),
    showCard: z.boolean().default(true),
    points: z.array(required(160, "Write the point")).max(MAX_PREVIEW_POINTS).default([]),
  }),
};

/** What members get once they join, as the starting bullet points of a new members' area preview. */
export const DEFAULT_PREVIEW_POINTS = [
  "Your member card with a QR code, in your phone's wallet or as a download",
  "Receipts for every payment, ready to download",
  "Renewal when it's due, and reminders before it is",
  "Updates from the team, by email or the channel you choose",
];
