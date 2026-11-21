import { SECTION_LABELS, SECTION_TYPES, type SectionType } from "@/lib/publicPage/sections";

/*
 * The block library's categories and each block's small preview, drawn as shapes in a 100 × 60 box (pure data, so a
 * test can check every block type has both). Tones: ink (headings), muted (text lines), accent (buttons, marks),
 * line (borders, image placeholders).
 */

export const BLOCK_CATEGORIES = ["Layout and design", "Content", "Membership", "Live numbers", "Areas"] as const;
export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

export const BLOCK_CATEGORY: Record<SectionType, BlockCategory> = {
  hero: "Layout and design", cta: "Layout and design", columns: "Layout and design", buttons: "Layout and design", iconList: "Layout and design", divider: "Layout and design", badges: "Layout and design",
  about: "Content", text: "Content", imageText: "Content", video: "Content", gallery: "Content", downloads: "Content", committee: "Content", testimonials: "Content", timeline: "Content", faq: "Content", links: "Content", contact: "Content", map: "Content", stats: "Content",
  plans: "Membership", card: "Membership", membersPreview: "Membership",
  liveStats: "Live numbers", counts: "Live numbers",
  areas: "Areas", units: "Areas",
};

/** One preview shape: a rectangle (`r`, x, y, width, height) or a circle (`c`, cx, cy, radius), with its tone. */
export type Shape = ["r", number, number, number, number, Tone] | ["c", number, number, number, Tone];
export type Tone = "ink" | "muted" | "accent" | "line";

const lines = (x: number, y: number, widths: number[], tone: Tone = "muted", gap = 6): Shape[] => widths.map((width, i) => ["r", x, y + i * gap, width, 3, tone]);
const heading = (x = 8, y = 8, width = 44): Shape => ["r", x, y, width, 6, "ink"];
const button = (x: number, y: number, width = 22): Shape => ["r", x, y, width, 8, "accent"];
const box = (x: number, y: number, width: number, height: number): Shape => ["r", x, y, width, height, "line"];

export const BLOCK_PREVIEWS: Record<SectionType, Shape[]> = {
  hero: [heading(8, 12, 46), ...lines(8, 24, [40, 34]), button(8, 38), box(60, 8, 32, 40)],
  cta: [box(4, 6, 92, 48), heading(12, 16, 50), ...lines(12, 28, [60]), button(12, 38), button(38, 38, 18)],
  about: [heading(), ...lines(8, 20, [84, 80, 84, 60, 72])],
  plans: [heading(), box(8, 20, 26, 32), box(37, 20, 26, 32), box(66, 20, 26, 32), button(12, 42, 18), button(41, 42, 18), button(70, 42, 18)],
  counts: [heading(), ["r", 8, 22, 22, 12, "ink"], ...lines(8, 40, [22]), ["r", 40, 22, 22, 12, "ink"], ...lines(40, 40, [22])],
  card: [...lines(8, 18, [36, 30, 34]), ["r", 52, 14, 40, 26, "accent"], box(56, 18, 10, 10)],
  stats: [["r", 8, 16, 18, 10, "ink"], ...lines(8, 30, [20]), ["r", 40, 16, 18, 10, "ink"], ...lines(40, 30, [20]), ["r", 72, 16, 18, 10, "ink"], ...lines(72, 30, [20])],
  committee: [heading(), ["c", 20, 32, 8, "line"], ["c", 50, 32, 8, "line"], ["c", 80, 32, 8, "line"], ...lines(12, 45, [16]), ...lines(42, 45, [16]), ...lines(72, 45, [16])],
  testimonials: [heading(), box(8, 20, 40, 30), box(52, 20, 40, 30), ...lines(12, 26, [30, 26]), ...lines(56, 26, [30, 26])],
  timeline: [heading(), ["r", 14, 20, 2, 34, "line"], ["c", 15, 24, 3, "accent"], ["c", 15, 38, 3, "accent"], ...lines(24, 22, [50]), ...lines(24, 36, [44])],
  imageText: [box(8, 10, 40, 40), heading(54, 14, 36), ...lines(54, 26, [38, 34, 30]), button(54, 44, 18)],
  video: [box(8, 8, 84, 44), ["c", 50, 30, 7, "accent"]],
  gallery: [box(8, 10, 26, 18), box(37, 10, 26, 18), box(66, 10, 26, 18), box(8, 32, 26, 18), box(37, 32, 26, 18), box(66, 32, 26, 18)],
  downloads: [heading(), box(8, 20, 84, 10), box(8, 34, 84, 10), ...lines(14, 23.5, [40]), ...lines(14, 37.5, [32])],
  units: [heading(), ...lines(8, 22, [30, 26, 34, 22], "ink", 8)],
  faq: [heading(), box(8, 20, 84, 9), box(8, 32, 84, 9), box(8, 44, 84, 9)],
  links: [heading(), ["r", 8, 24, 24, 8, "line"], ["r", 36, 24, 24, 8, "line"], ["r", 64, 24, 24, 8, "line"]],
  contact: [heading(), ["c", 12, 26, 3, "accent"], ...lines(18, 25, [40]), ["c", 12, 36, 3, "accent"], ...lines(18, 35, [32])],
  map: [heading(), box(8, 20, 84, 22), ["c", 50, 31, 4, "accent"], ...lines(8, 48, [40])],
  text: [heading(), ...lines(8, 20, [84, 84, 76])],
  liveStats: [heading(), ["r", 8, 22, 24, 12, "ink"], ...lines(8, 38, [24]), ["r", 40, 26, 50, 4, "accent"], ["r", 40, 34, 36, 4, "accent"], ["r", 40, 42, 24, 4, "accent"]],
  areas: [heading(), box(8, 20, 40, 32), box(52, 20, 40, 32), ...lines(12, 26, [24, 18]), ...lines(56, 26, [24, 18]), button(12, 40, 18), button(56, 40, 18)],
  columns: [box(6, 8, 27, 44), box(36.5, 8, 27, 44), box(67, 8, 27, 44), ...lines(10, 14, [18, 14, 16]), ...lines(40.5, 14, [18, 14, 16]), ...lines(71, 14, [18, 14, 16])],
  buttons: [button(8, 26, 24), ["r", 36, 26, 24, 8, "line"], ["r", 64, 26, 24, 8, "line"]],
  iconList: [["c", 14, 18, 5, "accent"], ...lines(24, 16, [30]), ["c", 14, 32, 5, "accent"], ...lines(24, 30, [26]), ["c", 14, 46, 5, "accent"], ...lines(24, 44, [34])],
  divider: [...lines(8, 14, [84, 70]), ["r", 8, 29, 84, 2, "line"], ...lines(8, 40, [84, 64])],
  badges: [["r", 8, 26, 22, 8, "line"], ["r", 34, 26, 18, 8, "line"], ["r", 56, 26, 26, 8, "line"]],
  membersPreview: [heading(), ["c", 11, 24, 2.5, "accent"], ...lines(16, 22.5, [30]), ["c", 11, 33, 2.5, "accent"], ...lines(16, 31.5, [26]), ["c", 11, 42, 2.5, "accent"], ...lines(16, 40.5, [28]), ["r", 56, 20, 36, 24, "accent"]],
};

const normal = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, "");

/** Block types in a category whose name or description contains every word of the search. */
export function blocksFor(category: BlockCategory, search: string): SectionType[] {
  const words = normal(search).split(/\s+/).filter(Boolean);
  return SECTION_TYPES.filter((type) => {
    if (BLOCK_CATEGORY[type] !== category) return false;
    const text = normal(`${SECTION_LABELS[type].label} ${SECTION_LABELS[type].description} ${category}`);
    return words.every((word) => text.includes(word));
  });
}
