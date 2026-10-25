"use client";

import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, Circle, Copy, Eye, EyeOff, Image as ImageIcon, LayoutGrid, Lock, Minus, Square, Trash2, Type, Unlock } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { CardElement } from "@/lib/cards/design/elements";
import type { OrderMove } from "@/lib/cards/design/layerEdit";
import type { CardLayer } from "@/lib/cards/design/layers";
import { ELEMENT_LABELS } from "../canvasInteraction";
import { layerLabel } from "../CardLayerView";

const KIND_ICONS = { text: Type, image: ImageIcon, rect: Square, ellipse: Circle, line: Minus };

/**
 * Everything on the side, top of the stack first: built-in items that are showing and every layer.
 * The selected entry can be moved through the stack; layers can also be hidden, locked, copied and
 * deleted.
 */
export function LayersPanel({ order, layers, visible, selected, onSelect, onMove, onLayerChange, onDuplicate, onDelete }: {
  order: string[];
  layers: CardLayer[];
  visible: Record<CardElement, boolean>;
  selected: string | null;
  onSelect: (key: string) => void;
  onMove: (key: string, move: OrderMove) => void;
  onLayerChange: (id: string, patch: Partial<CardLayer>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const rows = [...order].reverse().filter((key) => byId.has(key) || visible[key as CardElement] || key === selected);
  const selectedLayer = selected ? byId.get(selected) : undefined;
  const position = selected ? order.indexOf(selected) : -1;
  return (
    <section aria-labelledby="layers-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="layers-heading" className="text-label font-semibold text-ink">Layers</h3>
        {selected && position >= 0 ? (
          <div className="flex items-center" role="toolbar" aria-label="Arrange the selected item">
            <IconButton size="sm" label="Bring to front" disabled={position === order.length - 1} onClick={() => onMove(selected, "front")}><ChevronsUp /></IconButton>
            <IconButton size="sm" label="Bring forward" disabled={position === order.length - 1} onClick={() => onMove(selected, "forward")}><ChevronUp /></IconButton>
            <IconButton size="sm" label="Send backward" disabled={position === 0} onClick={() => onMove(selected, "backward")}><ChevronDown /></IconButton>
            <IconButton size="sm" label="Send to back" disabled={position === 0} onClick={() => onMove(selected, "back")}><ChevronsDown /></IconButton>
            {selectedLayer ? (
              <>
                <IconButton size="sm" label="Duplicate" onClick={() => onDuplicate(selectedLayer.id)}><Copy /></IconButton>
                <IconButton size="sm" variant="danger" label="Delete" onClick={() => onDelete(selectedLayer.id)}><Trash2 /></IconButton>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul className="flex flex-col gap-0.5 rounded-2xl border border-line p-1">
        {rows.map((key) => {
          const layer = byId.get(key);
          const Icon = layer ? KIND_ICONS[layer.kind] : LayoutGrid;
          const active = key === selected;
          return (
            <li key={key} className={cn("flex items-center gap-1 rounded-xl pr-1", active ? "bg-subtle shadow-[inset_0_0_0_1px_var(--color-primary)]" : "hover:bg-muted")}>
              <button type="button" aria-pressed={active} onClick={() => onSelect(key)} className={cn("flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 text-left text-[14px]", layer?.hidden ? "text-ink-muted" : "text-ink", active && "font-semibold")}>
                <Icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
                <span className="truncate">{layer ? layerLabel(layer) : ELEMENT_LABELS[key as CardElement]}</span>
              </button>
              {layer ? (
                <>
                  <IconButton size="sm" label={layer.hidden ? "Show" : "Hide"} onClick={() => onLayerChange(layer.id, { hidden: !layer.hidden })}>{layer.hidden ? <EyeOff /> : <Eye />}</IconButton>
                  <IconButton size="sm" label={layer.locked ? "Unlock" : "Lock"} onClick={() => onLayerChange(layer.id, { locked: !layer.locked })}>{layer.locked ? <Lock /> : <Unlock />}</IconButton>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-ink-muted">Top of the list prints on top. Items you turned off on this side don&apos;t show here.</p>
    </section>
  );
}
