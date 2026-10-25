"use client";

import { useEffect, useRef, useState } from "react";
import { saveCardDesign } from "@/app/actions/card-design";
import type { CardDesign } from "@/lib/cards/design/presets";
import { numberFormatError } from "@/lib/cards/numbering";
import type { SaveStatus } from "./controls";
import type { Numbering } from "./NumberingSection";

const SAVE_DELAY_MS = 900;

/**
 * Saves the design (and, for the organisation default and role designs, the card numbering) a moment
 * after the last change, one save at a time. `current()` is what will be saved next; `set` changes it
 * and schedules the save.
 */
export function useDesignAutosave(initial: { design: CardDesign; numbering: Numbering }, target: { organisationSlug: string; planId: string | null; roleId: string | null; numbers: boolean }) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(initial);
  const timer = useRef<number | null>(null);
  const saving = useRef(false);
  const dirty = useRef(false);

  const save = async (): Promise<void> => {
    if (saving.current) {
      dirty.current = true;
      return;
    }
    saving.current = true;
    dirty.current = false;
    setStatus("saving");
    try {
      const { design, numbering } = latest.current;
      const result = await saveCardDesign({
        organisationSlug: target.organisationSlug, planId: target.planId, roleId: target.roleId, design: design as unknown as Record<string, unknown>,
        ...(target.numbers && /^[A-Z0-9]{2,6}$/.test(numbering.prefix) ? { numberPrefix: numbering.prefix } : {}),
        ...(target.numbers && !numberFormatError(numbering.format) ? { numberFormat: numbering.format } : {}),
      });
      setStatus(result.ok ? (dirty.current ? "pending" : "saved") : "error");
      setError(result.ok ? null : result.error);
    } catch {
      setStatus("error");
      setError("The design couldn't be saved. Check your connection.");
    } finally {
      saving.current = false;
      if (dirty.current) void save();
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
    set(patch: Partial<typeof initial>) {
      latest.current = { ...latest.current, ...patch };
      schedule();
    },
  };
}
