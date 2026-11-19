#!/usr/bin/env node
// Copies Patch, the Space Works mascot, out of a local SpaceWorks-Design-System checkout. The design repo is only
// read, never changed.
//
//   node scripts/sync-patch.mjs [path-to-SpaceWorks-Design-System]   (default: ../SpaceWorks-Design-System)
//
// Writes, and these outputs are committed so builds never need the design repo:
//   public/brand/patch/patch.webp        the hero pose, from mascot/original/patch.png (640 px)
//   public/brand/patch/patch-poses.webp  the eight sneeze-loop frames from mascot/original/frames/, side by
//                                        side in order (frame N sits at N/7 of the sheet); CSS plays the idle
//                                        loop (frames 1-4) and the sneeze (frames 5-8) from it
//
// The walk sheets (patch-walk-right.webp and the approved left-facing patch-walk-left.webp) come from
// SpaceWorks-Events public/brand/patch/ unchanged, so they are not rebuilt here.
// Every pixel is the artwork as drawn: frames are placed, never scaled, recoloured, mirrored or redrawn.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const design = resolve(process.argv[2] ?? join(root, "..", "SpaceWorks-Design-System"));
const mascot = join(design, "mascot", "original");
const out = join(root, "public", "brand", "patch");
mkdirSync(out, { recursive: true });

const FRAMES = ["01-idle", "02-blink", "03-left-ear", "04-right-ear", "05-sneeze-prep", "06-sneeze", "07-recover", "08-back-to-idle"];
// Lossy like the kit's own compressed/ WebPs (alpha kept exact), small enough for empty states.
const WEBP = { quality: 86, alphaQuality: 100, smartSubsample: true, effort: 6 };

const frames = FRAMES.map((name) => readFileSync(join(mascot, "frames", `patch-${name}.png`)));
const { width, height } = await sharp(frames[0]).metadata();
const poses = await sharp({ create: { width: width * frames.length, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(frames.map((input, index) => ({ input, left: index * width, top: 0 })))
  .webp(WEBP)
  .toBuffer();
writeFileSync(join(out, "patch-poses.webp"), poses);

const hero = await sharp(readFileSync(join(mascot, "patch.png"))).webp(WEBP).toBuffer();
writeFileSync(join(out, "patch.webp"), hero);

console.log(`patch-poses.webp ${frames.length} × ${width}×${height}, ${poses.length} bytes; patch.webp ${hero.length} bytes`);
