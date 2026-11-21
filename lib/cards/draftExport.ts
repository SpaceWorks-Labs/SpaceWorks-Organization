import "server-only";

import { prisma } from "@/lib/db";
import { sampleHolder, sampleNumberUnits, SAMPLES, type Sample } from "@/components/cards/designer/sample";
import { deriveCardPrefix } from "./core";
import { brandingFor, designFor, organisationDesignRow, type CardOrgContext } from "./data";
import { designFonts, normalizeCardDesign, withOwnArtwork, type CardDesign, type CardSide } from "./design/presets";
import { readDraft } from "./draft";
import { loadCardFonts } from "./fonts";
import { buildCardScene } from "./layout";
import { DEFAULT_NUMBER_FORMAT, formatCardNumberFrom, normalizeNumberFormat, numberFormatError } from "./numbering";
import { renderCardsPdf } from "./renderPdf";
import { renderCardPng } from "./renderPng";
import type { CardBranding, CardHolder } from "./types";

/*
 * The designer's downloads: the design as the designer shows it (the saved draft, else the live design that
 * cards in this scope use), read from the database and never from the client, drawn with the sample member or
 * a preview holder (lib/cards/previewHolder.ts).
 */

type Scope = { plan: { id: string; name: string } | null; role: { id: string; name: string } | null; unit?: { id: string; name: string; path: string } | null; where: { organisationId: string; planId: string | null; roleId: string | null; unitId: string | null } };

export async function loadDraftForExport(ctx: CardOrgContext, scope: Scope) {
  const context = { organisationName: ctx.organisation.name, planName: scope.plan?.name ?? "" };
  const row = await prisma.cardDesign.findFirst({ where: scope.where, select: { design: true, draft: true, numberPrefix: true, numberFormat: true, watermarkUrl: true } });
  const orgRow = organisationDesignRow(ctx);
  const live = scope.plan ? designFor(ctx, scope.plan) : scope.role ? designFor(ctx, { id: "", name: "" }, scope.role.id) : scope.unit ? designFor(ctx, { id: "", name: "" }, null, scope.unit) : null;
  const draft = row ? readDraft(row, context) : null;
  const design: CardDesign = withOwnArtwork(draft?.design ?? live?.design ?? normalizeCardDesign(orgRow?.design, context), ctx.organisation.id);
  const branding: CardBranding = brandingFor(ctx, draft ? draft.watermarkUrl : live?.branding.watermarkUrl ?? orgRow?.watermarkUrl ?? null);
  // Plans number nothing; the designer previews them with a fixed sample number.
  const numbering = scope.plan
    ? null
    : draft
      ? { prefix: draft.numberPrefix, format: draft.numberFormat }
      : scope.role || scope.unit
        ? { prefix: deriveCardPrefix((scope.role ?? scope.unit)!.name), format: orgRow?.numberFormat ?? DEFAULT_NUMBER_FORMAT }
        : { prefix: orgRow?.numberPrefix ?? deriveCardPrefix(ctx.organisation.name), format: orgRow?.numberFormat ?? DEFAULT_NUMBER_FORMAT };
  return { design, branding, numbering };
}

/** The designer's sample member, with the scope's questions and sample card number. */
export function exportSampleHolder(ctx: CardOrgContext, scope: Scope, numbering: { prefix: string; format: string } | null, sample: Sample): CardHolder {
  const units = ctx.organisation.unitLevels;
  const number = numbering && !numberFormatError(numbering.format)
    ? formatCardNumberFrom(normalizeNumberFormat(numbering.format), { prefix: numbering.prefix || "M", seq: 42, memberNumber: 7, year: new Date().getFullYear(), ...sampleNumberUnits(units) })
    : "M-0042";
  const fields = new Map<string, { key: string; label: string }>();
  for (const field of scope.plan ? ctx.fields.get(scope.plan.id) ?? [] : [...ctx.fields.values()].flat()) {
    if (!field.section && !fields.has(field.key)) fields.set(field.key, { key: field.key, label: field.label });
  }
  return sampleHolder(SAMPLES[sample], scope.plan?.name ?? "", scope.role?.name ?? "", number, [...fields.values()], units);
}

export function isSample(value: string | null): value is Sample {
  return value !== null && Object.hasOwn(SAMPLES, value);
}

/** A card-size PDF of both sides (optionally with bleed and crop marks), or a 300 dpi PNG of one side. */
export async function renderDraftExport(design: CardDesign, branding: CardBranding, holder: CardHolder, options: { format: "pdf" | "png"; side: CardSide; bleedMm: number; title: string }) {
  const { measurer } = await loadCardFonts(designFonts(design));
  const sides: CardSide[] = design.backEnabled ? ["front", "back"] : ["front"];
  if (options.format === "png") return renderCardPng(buildCardScene({ settings: design[options.side], holder, branding, measurer }));
  return renderCardsPdf([sides.map((side) => buildCardScene({ settings: design[side], holder, branding, measurer }))], { layout: "card", title: options.title, bleedMm: options.bleedMm });
}
