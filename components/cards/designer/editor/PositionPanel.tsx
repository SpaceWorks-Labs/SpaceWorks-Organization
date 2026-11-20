"use client";

import { useId, useState } from "react";
import { Link2, Link2Off } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { selectionBox, type BoxField } from "@/lib/cards/design/editor/position";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import { POSITION_CONTROLS } from "./arrangeControls";
import type { EditorActions } from "./useEditorActions";

const LABEL = Object.fromEntries(POSITION_CONTROLS.map((control) => [control.id, control.label])) as Record<(typeof POSITION_CONTROLS)[number]["id"], string>;
const SHORT: Record<BoxField, string> = { x: "X", y: "Y", w: "W", h: "H", rotation: "Turn" };

/** A number field that keeps what is typed while focused and applies each valid value as it goes. */
function NumberBox({ field, value, step, disabled, onCommit }: { field: BoxField; value: number; step: number; disabled?: boolean; onCommit: (value: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-caption text-ink-muted"><span aria-hidden>{SHORT[field]}</span><span className="sr-only">{LABEL[field]}</span></label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        disabled={disabled}
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value.trim() !== "" && Number.isFinite(next)) onCommit(next);
        }}
        className="px-3 text-right tabular-nums"
      />
    </div>
  );
}

/**
 * Exact position, size and turn of the selection, in millimetres from the card's top left. One layer
 * shows its own box; several show the box around them all (resizing stretches them together).
 */
export function PositionPanel({ layers, selected, actions }: { layers: CardLayer[]; selected: CardLayer[]; actions: EditorActions }) {
  const [lockRatio, setLockRatio] = useState(false);
  const box = selectionBox(layers, selected.map((layer) => layer.id));
  if (!box) return null;
  const locked = selected.every((layer) => layer.locked);
  const edit = (field: BoxField) => (value: number) => actions.editBox(field, value, lockRatio);
  return (
    <section aria-labelledby="position-heading" className="flex flex-col gap-3">
      <h3 id="position-heading" className="text-label font-semibold text-ink">Position</h3>
      {locked ? <p className="text-caption text-ink-muted">Unlock the layer to move or resize it.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <NumberBox field="x" value={box.x} step={0.5} disabled={locked} onCommit={edit("x")} />
        <NumberBox field="y" value={box.y} step={0.5} disabled={locked} onCommit={edit("y")} />
        <NumberBox field="w" value={box.w} step={0.5} disabled={locked} onCommit={edit("w")} />
        <NumberBox field="h" value={box.h} step={0.5} disabled={locked} onCommit={edit("h")} />
      </div>
      <div className="flex items-end gap-2">
        {box.rotation !== null ? <div className="flex-1"><NumberBox field="rotation" value={box.rotation} step={1} disabled={locked} onCommit={edit("rotation")} /></div> : <p className="flex-1 text-caption text-ink-muted">Turn several layers with the knob above the selection.</p>}
        <IconButton size="sm" variant="secondary" label={LABEL["lock-ratio"]} aria-pressed={lockRatio} onClick={() => setLockRatio(!lockRatio)}>{lockRatio ? <Link2 /> : <Link2Off />}</IconButton>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={locked} onClick={() => actions.centre("x")}>{LABEL["centre-x"]}</Button>
        <Button size="sm" variant="secondary" disabled={locked} onClick={() => actions.centre("y")}>{LABEL["centre-y"]}</Button>
        <Button size="sm" variant="secondary" disabled={locked} onClick={actions.fill}>{LABEL.fill}</Button>
      </div>
    </section>
  );
}
