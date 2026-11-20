/** Pointer helpers for the card designer's drags. */

/** Pointer position on the card in millimetres. */
export function pointOnCard(frame: Element, event: { clientX: number; clientY: number }, pxPerMm: number) {
  const box = frame.getBoundingClientRect();
  return { x: (event.clientX - box.left) / pxPerMm, y: (event.clientY - box.top) / pxPerMm };
}

/** Run `onMove` for every pointer move until the press ends, then `onEnd`. */
export function follow(onMove: (event: PointerEvent) => void, onEnd: (event: PointerEvent) => void) {
  const end = (event: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    onEnd(event);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}
