"use client";

import { useEffect, useId } from "react";

const MESSAGE = "You have unsaved changes. Leave this page and discard them?";

// One set of listeners for the whole page, however many forms are dirty, so leaving asks once.
const dirtyForms = new Set<string>();

function beforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

function guardLinkNavigation(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.href === window.location.href) return;
  // In-page anchors (e.g. a settings section nav) never leave the form.
  if (anchor.hash && anchor.href.split("#")[0] === window.location.href.split("#")[0]) return;
  if (!window.confirm(MESSAGE)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

/** Asks before the page is closed or a link leaves it while `isDirty` holds. Any number of forms can use it. */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const id = useId();
  useEffect(() => {
    if (!isDirty) return;
    if (dirtyForms.size === 0) {
      window.addEventListener("beforeunload", beforeUnload);
      document.addEventListener("click", guardLinkNavigation, true);
    }
    dirtyForms.add(id);
    return () => {
      dirtyForms.delete(id);
      if (dirtyForms.size === 0) {
        window.removeEventListener("beforeunload", beforeUnload);
        document.removeEventListener("click", guardLinkNavigation, true);
      }
    };
  }, [id, isDirty]);
}
