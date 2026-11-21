"use client";

import { Callout } from "@/components/ui/display";
import { MAX_LAYERS } from "@/lib/cards/design/layerTypes";
import type { CardHolder } from "@/lib/cards/types";
import type { CertificateTextValues } from "@/lib/certificates/placeholders";
import { certificatePlaceholderOptions, samplePlaceholderValue } from "./placeholders";

/**
 * The words a certificate fills in for each member: each adds its placeholder to the selected text layer, or a new
 * text layer. The sample member's value shows beside each, so the list reads like the certificate will.
 */
export function PlaceholderPanel({ unitLevels, sample, full, onInsertText }: {
  unitLevels: readonly string[];
  sample: { holder: CardHolder; values: CertificateTextValues };
  full: boolean;
  onInsertText: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-ink-muted">Select a text layer to add a field to it, or add the field as new text. Anything else typed in braces prints as typed.</p>
      {full ? <Callout tone="info">The page holds the most layers it can ({MAX_LAYERS}), so fields go into the selected text layer only.</Callout> : null}
      <ul aria-label="Certificate fields" className="flex flex-col gap-1">
        {certificatePlaceholderOptions(unitLevels).map(({ key, label }) => {
          const value = samplePlaceholderValue(key, sample);
          return (
            <li key={key}>
              <button type="button" onClick={() => onInsertText(key)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-left transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))] motion-reduce:transition-none">
                <span className="flex flex-col">
                  <span className="text-body-ui text-ink">{label}</span>
                  <span className="code-text text-caption text-ink-muted">{`{${key}}`}</span>
                </span>
                <span className="min-w-0 max-w-[55%] truncate text-right text-caption text-ink-secondary" title={value || undefined}>{value || "Empty for the sample"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
