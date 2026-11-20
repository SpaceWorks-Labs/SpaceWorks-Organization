/*
 * Brand colours from a logo: median cut over raw RGBA pixels. Pure, so it is unit-tested on synthetic buffers;
 * the server decodes and downsamples the logo with sharp first (lib/cards/logoPalette.ts).
 *
 * Transparent pixels and near-white ones (the paper a logo sits on) are skipped. Pixels are binned at 5 bits
 * per channel, the bins are split along their widest channel at the weighted median until there are enough
 * boxes, and each box gives its mean colour. Colours too close to a more prominent one are dropped, so two
 * near-blacks (anti-aliased edges, a shadow) come back as one.
 */

export type PaletteOptions = {
  /** Colours to return at most. */
  max?: number;
  /** Boxes to cut before merging. */
  boxes?: number;
  /** Share of counted pixels a colour needs (0–1). */
  minShare?: number;
  /** Squared RGB distance under which two colours count as the same. */
  minDistance?: number;
};

type Bin = { r: number; g: number; b: number; count: number };
type Box = { bins: Bin[]; count: number };

const ALPHA_MIN = 128;
const WHITE_MIN = 242;

function hex(value: number) {
  return Math.round(value).toString(16).padStart(2, "0").toUpperCase();
}

function histogram(pixels: ArrayLike<number>): { bins: Bin[]; total: number } {
  const map = new Map<number, Bin>();
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    if (pixels[i + 3]! < ALPHA_MIN) continue;
    if (r >= WHITE_MIN && g >= WHITE_MIN && b >= WHITE_MIN) continue;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = map.get(key);
    // Bins hold channel sums until the end, so a box's mean is the mean of its real pixels.
    if (bin) {
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bin.count += 1;
    } else map.set(key, { r, g, b, count: 1 });
    total += 1;
  }
  return { bins: [...map.values()], total };
}

const CHANNELS = ["r", "g", "b"] as const;

function widest(box: Box) {
  let best: { channel: (typeof CHANNELS)[number]; range: number } = { channel: "r", range: -1 };
  for (const channel of CHANNELS) {
    let lo = 255;
    let hi = 0;
    for (const bin of box.bins) {
      const mean = bin[channel] / bin.count;
      lo = Math.min(lo, mean);
      hi = Math.max(hi, mean);
    }
    if (hi - lo > best.range) best = { channel, range: hi - lo };
  }
  return best;
}

function split(box: Box): [Box, Box] | null {
  if (box.bins.length < 2) return null;
  const { channel } = widest(box);
  const sorted = [...box.bins].sort((a, b) => a[channel] / a.count - b[channel] / b.count);
  let running = 0;
  let at = 1;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    running += sorted[i]!.count;
    at = i + 1;
    if (running >= box.count / 2) break;
  }
  const left = sorted.slice(0, at);
  const right = sorted.slice(at);
  const sum = (bins: Bin[]) => bins.reduce((total, bin) => total + bin.count, 0);
  return [{ bins: left, count: sum(left) }, { bins: right, count: sum(right) }];
}

function mean(box: Box) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const bin of box.bins) {
    r += bin.r;
    g += bin.g;
    b += bin.b;
  }
  return [r / box.count, g / box.count, b / box.count] as const;
}

/** Up to `max` (6) distinct colours as "#RRGGBB", most prominent first. */
export function extractPalette(pixels: ArrayLike<number>, options: PaletteOptions = {}): string[] {
  const { max = 6, boxes: boxLimit = 16, minShare = 0.01, minDistance = 48 * 48 } = options;
  const { bins, total } = histogram(pixels);
  if (!total) return [];
  let boxes: Box[] = [{ bins, count: total }];
  while (boxes.length < boxLimit) {
    // Split the box that most deserves it: many pixels spread over a wide range.
    let index = -1;
    let score = 0;
    boxes.forEach((box, i) => {
      if (box.bins.length < 2) return;
      const value = box.count * (widest(box).range + 1);
      if (value > score) {
        score = value;
        index = i;
      }
    });
    if (index < 0) break;
    const halves = split(boxes[index]!);
    if (!halves) break;
    boxes = [...boxes.slice(0, index), ...halves, ...boxes.slice(index + 1)];
  }
  // A colour close to a more prominent one adds its pixels to it instead of standing on its own.
  const chosen: Array<{ rgb: readonly [number, number, number]; count: number }> = [];
  for (const box of [...boxes].sort((a, b) => b.count - a.count)) {
    const rgb = mean(box);
    const near = chosen.find(({ rgb: other }) => (other[0] - rgb[0]) ** 2 + (other[1] - rgb[1]) ** 2 + (other[2] - rgb[2]) ** 2 < minDistance);
    if (near) near.count += box.count;
    else chosen.push({ rgb, count: box.count });
  }
  return chosen
    .filter((colour) => colour.count / total >= minShare)
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map(({ rgb: [r, g, b] }) => `#${hex(r)}${hex(g)}${hex(b)}`);
}
