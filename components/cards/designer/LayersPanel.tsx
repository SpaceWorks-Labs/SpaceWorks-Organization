"use client";

import type { MouseEvent } from "react";
import { Barcode, Circle, Eye, EyeOff, Group, Image as ImageIcon, LayoutGrid, Lock, Minus, QrCode, Shapes, Square, Star, Type, Unlock, UserRound } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { CardElement } from "@/lib/cards/design/elements";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import { ELEMENT_LABELS } from "../canvasInteraction";
import { layerLabel } from "../CardLayerView";

const KIND_ICONS = { text: Type, image: ImageIcon, rect: Square, ellipse: Circle, line: Minus, shape: Shapes, icon: Star, qr: QrCode, barcode: Barcode, photo: UserRound };

/**
 * Everything on the side, top of the stack first: built-in items that are showing and every layer.
 * Click selects, Shift-click adds a layer to the selection; layers can be hidden and locked here. The
 * Arrange panel moves the selection through the stack.
 */
export function LayersPanel({ order, layers, visible, selection, onSelect, onLayerChange }: {
  order: string[];
  layers: CardLayer[];
  visible: Record<CardElement, boolean>;
  selection: readonly string[];
  onSelect: (key: string, additive: boolean) => void;
  onLayerChange: (id: string, patch: Partial<CardLayer>) => void;
}) {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const rows = [...order].reverse().filter((key) => byId.has(key) || visible[key as CardElement] || selection.includes(key));
  return (
    <section aria-labelledby="layers-heading" className="flex flex-col gap-2">
      <h3 id="layers-heading" className="text-label font-semibold text-ink">Layers</h3>
      <ul data-layers-list aria-label="Layers, top first" className="flex flex-col gap-0.5 rounded-xl border border-line p-1">
        {rows.map((key) => {
          const layer = byId.get(key);
          const Icon = layer ? KIND_ICONS[layer.kind] : LayoutGrid;
          const active = selection.includes(key);
          return (
            <li key={key} className={cn("flex items-center gap-1 rounded-xl pr-1", active ? "bg-subtle shadow-[inset_0_0_0_1px_var(--color-primary)]" : "hover:bg-muted")}>
              <button type="button" aria-pressed={active} onClick={(event: MouseEvent) => onSelect(key, event.shiftKey && Boolean(layer))} className={cn("flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 text-left text-[14px]", layer?.hidden ? "text-ink-muted" : "text-ink", active && "font-semibold")}>
                <Icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
                <span className="truncate">{layer ? layerLabel(layer) : ELEMENT_LABELS[key as CardElement]}</span>
                {layer?.groupId ? <Group aria-label="In a group" className="ml-auto size-3.5 shrink-0 text-ink-muted" /> : null}
              </button>
              {layer ? (
                <>
                  <IconButton size="sm" label={layer.hidden ? `Show ${layerLabel(layer)}` : `Hide ${layerLabel(layer)}`} onClick={() => onLayerChange(layer.id, { hidden: !layer.hidden })}>{layer.hidden ? <EyeOff /> : <Eye />}</IconButton>
                  <IconButton size="sm" label={layer.locked ? `Unlock ${layerLabel(layer)}` : `Lock ${layerLabel(layer)}`} onClick={() => onLayerChange(layer.id, { locked: !layer.locked })}>{layer.locked ? <Lock /> : <Unlock />}</IconButton>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-ink-muted">Top of the list prints on top. Shift-click to select several. Items you turned off on this side don&apos;t show here.</p>
    </section>
  );
}
