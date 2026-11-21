"use client";

import { useEffect, useRef, useState } from "react";
import { saveCertificateDesign } from "@/app/actions/certificate-designs";
import type { SaveStatus } from "@/components/cards/designer/controls";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import { certificateNumberFormatError } from "@/lib/certificates/design";

const SAVE_DELAY_MS = 900;
const PREFIX = /^[A-Z0-9]{2,6}$/;

export type CertificateDetails = { name: string; typeLabel: string; numberPrefix: string; numberFormat: string };
type State = { side: CardSideSettings; details: CertificateDetails };

/**
 * Saves the certificate draft (the page's layers and the design's details) a moment after the last change, one
 * save at a time, like the card designer's autosave. Details that aren't valid yet (an empty name, a half-typed
 * number pattern) are left out until they are. `current()` is what will be saved next; `set` changes it and
 * schedules the save; `save` saves now (before approving, downloading or changing the page).
 */
export function useCertificateAutosave(initial: State, target: { organisationSlug: string; designId: string }) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(initial);
  const timer = useRef<number | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const dirty = useRef(false);

  /** One save of what is current now; true when it was stored. */
  const run = async (): Promise<boolean> => {
    dirty.current = false;
    setStatus("saving");
    try {
      const { side, details } = latest.current;
      const name = details.name.trim();
      const typeLabel = details.typeLabel.trim();
      const result = await saveCertificateDesign({
        organisationSlug: target.organisationSlug,
        designId: target.designId,
        design: side as unknown as Record<string, unknown>,
        ...(name ? { name } : {}),
        ...(typeLabel ? { typeLabel } : {}),
        ...(PREFIX.test(details.numberPrefix) ? { numberPrefix: details.numberPrefix } : {}),
        ...(details.numberFormat && !certificateNumberFormatError(details.numberFormat) ? { numberFormat: details.numberFormat } : {}),
      });
      setStatus(result.ok ? (dirty.current ? "pending" : "saved") : "error");
      setError(result.ok ? null : result.error);
      return result.ok;
    } catch {
      setStatus("error");
      setError("The design couldn't be saved. Check your connection.");
      return false;
    }
  };

  /** Save now. While a save is under way, the latest state is saved right after it and this waits for both. */
  const save = async (): Promise<boolean> => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) {
      dirty.current = true;
      return inflight.current;
    }
    const chain = (async () => {
      let ok = await run();
      while (dirty.current) ok = await run();
      return ok;
    })();
    inflight.current = chain;
    try {
      return await chain;
    } finally {
      inflight.current = null;
    }
  };

  // Leaving inside the debounce window saves the pending edit instead of dropping it. `save` reads only refs and props.
  useEffect(() => () => {
    if (!timer.current) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on unmount
  }, []);

  const schedule = () => {
    setStatus("pending");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void save();
    }, SAVE_DELAY_MS);
  };

  return {
    status,
    error,
    setError,
    save,
    current: () => latest.current,
    set(patch: Partial<State>) {
      latest.current = { ...latest.current, ...patch };
      schedule();
    },
  };
}
