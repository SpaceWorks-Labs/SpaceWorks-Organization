import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { cached, orgCacheKey, PUBLIC_PAGE_TTL_SECONDS } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { designFor, loadCardOrgContext, organisationDesignRow, type CardOrgContext } from "@/lib/cards/data";
import { DEFAULT_NUMBER_FORMAT, formatCardNumberFrom, yearIn } from "@/lib/cards/numbering";
import { renderMemberCard } from "@/lib/cards/render";
import type { CardHolder } from "@/lib/cards/types";
import type { SampleCard } from "./live";

/*
 * The member card section's sample: the organisation's own live (approved) card design, drawn by the card renderer
 * with sample holder data. It never reads a member: no name, photo, number, answer or verify token of a real
 * person can reach it. The design is the organisation default, else the first plan's own design, else the built-in
 * one (drafts never draw: loadCardOrgContext reads live rows only). Images are cached under the organisation's
 * public-page key with a version hash of everything drawn, so an approved design change gets a new URL.
 */

export const SAMPLE_HOLDER_NAME = "Shaan Shoukath";
const SAMPLE_HOLDER_ROLE = "Systems Engineer";
const SAMPLE_TTL_SECONDS = PUBLIC_PAGE_TTL_SECONDS * 6;
const OUTPUT_WIDTH = 960;

/** The sample holder printed on the card. The QR opens a reserved example domain, never a real check page. */
export function sampleHolder(input: { planName: string; numberFormat: string; numberPrefix: string; year: number }): CardHolder {
  return {
    memberId: "sample",
    verifyToken: "sample",
    verifyUrl: "https://example.org/verify/sample",
    displayName: SAMPLE_HOLDER_NAME,
    role: SAMPLE_HOLDER_ROLE,
    planName: input.planName,
    details: [],
    photoUrl: null,
    idNumber: formatCardNumberFrom(input.numberFormat || DEFAULT_NUMBER_FORMAT, { prefix: input.numberPrefix, seq: 42, memberNumber: 42, year: input.year, unitCode: "CITY", unitCodes: ["NORTH", "CITY"] }),
    validUntil: `31 Mar ${input.year + 1}`,
    units: [],
  };
}

async function samplePlan(ctx: CardOrgContext) {
  const plans = await prisma.membershipPlan.findMany({ where: { organisationId: ctx.organisation.id, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  if (organisationDesignRow(ctx)) return plans[0] ?? { id: "", name: "Membership" };
  return plans.find((plan) => ctx.designs.some((row) => row.planId === plan.id && row.roleId === null && !row.unitId)) ?? plans[0] ?? { id: "", name: "Membership" };
}

/** What the sample draws, and its version: the design, the branding and the sample holder. */
async function sampleInput(organisationId: string) {
  const ctx = await loadCardOrgContext(organisationId);
  if (!ctx) return null;
  const plan = await samplePlan(ctx);
  const { design, branding } = designFor(ctx, plan);
  const row = ctx.designs.find((one) => one.planId === (plan.id || null) && one.roleId === null && !one.unitId) ?? organisationDesignRow(ctx);
  const holder = sampleHolder({ planName: plan.name, numberFormat: row?.numberFormat ?? DEFAULT_NUMBER_FORMAT, numberPrefix: row?.numberPrefix ?? "", year: yearIn(ctx.organisation.timezone) });
  const version = createHash("sha256").update(JSON.stringify({ design, branding, holder })).digest("hex").slice(0, 16);
  return { input: { design, branding }, holder, version, widthMm: design.front.widthMm, heightMm: design.front.heightMm };
}

/** The sample card's image URL and paper shape, for the page (no drawing happens here). */
export async function sampleCardFor(org: { id: string; slug: string }): Promise<SampleCard | null> {
  const sample = await sampleInput(org.id);
  if (!sample) return null;
  return { src: `/api/o/${org.slug}/sample-card?v=${sample.version}`, widthMm: sample.widthMm, heightMm: sample.heightMm };
}

/** The sample card's front as WebP, drawn once per design version and cached. */
export async function renderSampleCard(organisationId: string): Promise<Buffer | null> {
  const sample = await sampleInput(organisationId);
  if (!sample) return null;
  const encoded = await cached(orgCacheKey(organisationId, "public-page", "sample-card", sample.version), SAMPLE_TTL_SECONDS, async () => {
    const png = await renderMemberCard(sample.input, sample.holder, "png", { side: "front", title: "Sample membership card" });
    const webp = await sharp(png).resize({ width: OUTPUT_WIDTH, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
    return webp.toString("base64");
  });
  return Buffer.from(encoded, "base64");
}
