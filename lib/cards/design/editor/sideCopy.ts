import type { CardSideSettings } from "../elements";
import type { CardLayer } from "../layerTypes";
import { newLayerId } from "./clipboard";
import { newGroupId } from "./groups";

/*
 * Copying one side of the card onto the other. "Copy layout" carries the arrangement: the layers
 * (with new ids and group ids), the stacking order, and where the built-in items sit and how big
 * they are; the target keeps its own words, colours, background and which items it shows.
 * "Duplicate side" copies the whole side. Design-level settings (such as whether a back prints)
 * aren't part of a side, so neither touches them.
 */

/** Copies of `layers` with fresh ids and group ids, and the old-to-new id map. */
export function cloneLayers(layers: readonly CardLayer[]): { layers: CardLayer[]; ids: Map<string, string> } {
  const ids = new Map<string, string>();
  const groups = new Map<string, string>();
  const taken = new Set<string>();
  const copies = layers.map((layer) => {
    const id = newLayerId(taken);
    taken.add(id);
    ids.set(layer.id, id);
    let groupId: string | null = null;
    if (layer.groupId) {
      groupId = groups.get(layer.groupId) ?? newGroupId(groups.values());
      groups.set(layer.groupId, groupId);
    }
    return { ...structuredClone(layer), id, groupId } as CardLayer;
  });
  return { layers: copies, ids };
}

function clonedArrangement(from: CardSideSettings) {
  const { layers, ids } = cloneLayers(from.layers);
  return { layers, order: from.order.map((key) => ids.get(key) ?? key) };
}

/** `to` with `from`'s layers, stacking and built-in item positions and sizes. */
export function copySideLayout<T extends CardSideSettings>(from: CardSideSettings, to: T): T {
  return {
    ...to,
    ...clonedArrangement(from),
    elementPositions: structuredClone(from.elementPositions),
    elementSizes: structuredClone(from.elementSizes),
    elementTextSizes: structuredClone(from.elementTextSizes),
  };
}

/** A full copy of `from` (layers with new ids), to replace the other side. */
export function duplicateSide<T extends CardSideSettings>(from: T): T {
  return { ...structuredClone(from), ...clonedArrangement(from) };
}
