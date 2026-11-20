import type { KeyboardEvent } from "react";
import { EMPTY_BRANDING } from "@/lib/cards/types";
import { sampleHolder, SAMPLES } from "../sample";

/** Fired on window when the organisation's templates change, so an open gallery reloads them. */
export const TEMPLATES_CHANGED_EVENT = "swo:card-templates-changed";

export function announceTemplatesChanged() {
  window.dispatchEvent(new Event(TEMPLATES_CHANGED_EVENT));
}

/**
 * Popups render in portals, but React still bubbles their keys to the designer, whose shortcuts (Delete,
 * arrows) would act on the card. Stop them at the popup.
 */
export function keepKeysInside(event: KeyboardEvent) {
  event.stopPropagation();
}

const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatWhen(iso: string) {
  return dateTime.format(new Date(iso));
}

/** Small static previews (history, templates) use the sample member without the organisation's branding. */
export const PREVIEW_HOLDER = sampleHolder(SAMPLES.latin, "", "", "M-0042", []);
export const PREVIEW_BRANDING = EMPTY_BRANDING;
