import { CARD_PREFIX_PATTERN } from "./core";
import type { CardDesignContext } from "./design/normalize";
import { normalizeCardDesign, type CardDesign } from "./design/presets";
import { DEFAULT_NUMBER_FORMAT, normalizeNumberFormat, numberFormatError } from "./numbering";

/*
 * A design's pending changes. Managers save drafts; members' cards keep the approved (live) design,
 * numbering and watermark until the organisation's owner approves the draft (lib/cards/approval.ts).
 */

export type CardDraft = { design: CardDesign; numberPrefix: string; numberFormat: string; watermarkUrl: string | null };

type Row = { design: unknown; draft: unknown; numberPrefix: string; numberFormat: string; watermarkUrl: string | null };

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** What the designer edits: the draft when there is one, else the live design. Every value is checked again. */
export function readDraft(row: Row, context: CardDesignContext): CardDraft {
  const draft = record(row.draft);
  const prefix = typeof draft?.numberPrefix === "string" && CARD_PREFIX_PATTERN.test(draft.numberPrefix) ? draft.numberPrefix : row.numberPrefix;
  const format = typeof draft?.numberFormat === "string" && !numberFormatError(draft.numberFormat) ? normalizeNumberFormat(draft.numberFormat) : row.numberFormat || DEFAULT_NUMBER_FORMAT;
  return {
    design: normalizeCardDesign(draft ? draft.design : row.design, context),
    numberPrefix: prefix,
    numberFormat: format,
    watermarkUrl: draft && "watermarkUrl" in draft ? (typeof draft.watermarkUrl === "string" ? draft.watermarkUrl : null) : row.watermarkUrl,
  };
}

/** Whether a draft would change anything on members' cards. */
export function draftDiffers(row: Row, context: CardDesignContext) {
  if (!row.draft) return false;
  if (row.design === null) return true;
  const draft = readDraft(row, context);
  const live = readDraft({ ...row, draft: null }, context);
  return JSON.stringify(draft) !== JSON.stringify(live);
}
