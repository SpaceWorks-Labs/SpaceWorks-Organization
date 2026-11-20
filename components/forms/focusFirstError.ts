"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Moves focus to the first field marked `aria-invalid="true"` inside `root`, scrolled into view. A marked
 * fieldset or group hands focus to its first control. Returns whether one was found.
 */
export function focusFirstError(root: ParentNode | null | undefined): boolean {
  const invalid = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!invalid) return false;
  const target = invalid.matches(FOCUSABLE) ? invalid : (invalid.querySelector<HTMLElement>(FOCUSABLE) ?? invalid);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
  return true;
}

/**
 * After a failed submit, focuses the first invalid field once the errors have rendered. Pass the field-errors
 * object a submit sets: each new object with entries moves focus once, so never rebuild it while someone types.
 */
export function useFocusFirstError(root: RefObject<HTMLElement | null>, errors: object | null | undefined) {
  useEffect(() => {
    if (errors && Object.values(errors).some(Boolean)) focusFirstError(root.current);
  }, [root, errors]);
}
