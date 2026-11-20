import type { OrderMove } from "../layerEdit";

/*
 * Stacking several items at once. `order` holds built-in item keys and layer ids, bottom first. The
 * selected items keep their order among themselves; a step forward or back passes one unselected item.
 */

export function moveManyInOrder(order: readonly string[], keys: readonly string[], move: OrderMove): string[] {
  const picked = new Set(keys.filter((key) => order.includes(key)));
  if (picked.size === 0) return [...order];
  const rest = order.filter((key) => !picked.has(key));
  const chosen = order.filter((key) => picked.has(key));
  if (move === "front") return [...rest, ...chosen];
  if (move === "back") return [...chosen, ...rest];
  const next = [...order];
  if (move === "forward") {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (picked.has(next[index]!) && !picked.has(next[index + 1]!)) [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
    }
  } else {
    for (let index = 1; index < next.length; index += 1) {
      if (picked.has(next[index]!) && !picked.has(next[index - 1]!)) [next[index], next[index - 1]] = [next[index - 1]!, next[index]!];
    }
  }
  return next;
}

/** Whether the move would change anything (for disabling buttons). */
export function canMoveInOrder(order: readonly string[], keys: readonly string[], move: OrderMove) {
  const next = moveManyInOrder(order, keys, move);
  return next.some((key, index) => key !== order[index]);
}
