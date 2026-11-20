"use client";

import { Callout } from "@/components/ui/display";
import { fillLayerText } from "@/lib/cards/design/layers";
import { placeholderOptions } from "@/lib/cards/design/library/placeholders";
import { MAX_LAYERS } from "@/lib/cards/design/layerTypes";
import type { ElementsPanelProps } from "./ElementsPanel";

/**
 * Member details to print as text: each adds its placeholder to the selected text layer, or a new
 * text layer, and fills in for every member. The sample member's value shows beside each, so the
 * list reads like the card will.
 */
export function FieldsPanel({ holder, full, unitLevels, onInsertText }: ElementsPanelProps) {
  const levels = unitLevels ?? holder.units?.map((unit) => unit.levelName);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-ink-muted">Select a text layer to add a field to it, or add the field as new text.</p>
      {full ? <Callout tone="info">This side holds the most layers it can ({MAX_LAYERS}), so fields go into the selected text layer only.</Callout> : null}
      <ul aria-label="Member fields" className="flex flex-col gap-1">
        {placeholderOptions(levels).map(({ key, label }) => {
          const sample = fillLayerText(`{${key}}`, holder);
          return (
            <li key={key}>
              <button type="button" onClick={() => onInsertText(key)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]">
                <span className="flex flex-col">
                  <span className="text-body-ui text-ink">{label}</span>
                  <span className="code-text text-caption text-ink-muted">{`{${key}}`}</span>
                </span>
                <span className="min-w-0 max-w-[55%] truncate text-right text-caption text-ink-secondary">{sample || "Empty for this member"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
