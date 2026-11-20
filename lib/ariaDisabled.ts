/**
 * CR-DISABLED-01: a control marked `aria-disabled="true"` stays focusable (so it can explain itself) but must not
 * activate. CSS stops the pointer; this stops the keyboard. Enter on a link and Enter or Space on a button arrive
 * as a click, so one capture-phase listener on the document, ahead of React's root listener, cancels any click
 * that lands inside an aria-disabled element. Installed once by components/providers.tsx.
 */
export const ARIA_DISABLED_SELECTOR = '[aria-disabled="true"]';

export function isInsideAriaDisabled(target: EventTarget | null): boolean {
  return typeof Element !== "undefined" && target instanceof Element && target.closest(ARIA_DISABLED_SELECTOR) !== null;
}

export function installAriaDisabledGuard(doc: Document = document): () => void {
  const onClick = (event: Event) => {
    if (!isInsideAriaDisabled(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}
