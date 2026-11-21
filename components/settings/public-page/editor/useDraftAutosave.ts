"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { savePublicPageDraft } from "@/app/actions/public-page";
import type { PageDocument } from "@/lib/publicPage/sections";

const SAVE_DELAY_MS = 1200;

/** "invalid": the server refused the draft (marked sections); "error": it couldn't be reached or refused for another reason. */
export type DraftStatus = "saved" | "pending" | "saving" | "invalid" | "error";

/**
 * Saves the document as the draft a moment after the last change, one save at a time (visitors never see a draft).
 * `baseline` is the last document the server holds; `markSaved` moves it after a publish, a restore or a discard, so
 * those never trigger a save of their own. `cancel` drops a pending save (before publishing the same document).
 */
export function useDraftAutosave(slug: string, document: PageDocument, enabled: boolean, onSaved?: () => void) {
  const [baseline, setBaseline] = useState(() => JSON.stringify(document));
  const [status, setStatus] = useState<DraftStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<number | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const latest = useRef(document);
  const saved = useRef(onSaved);
  const serialised = JSON.stringify(document);
  const dirty = serialised !== baseline;

  useEffect(() => {
    latest.current = document;
    saved.current = onSaved;
  }, [document, onSaved]);

  const save = useCallback(async (): Promise<void> => {
    if (inFlight.current) await inFlight.current;
    const snapshot = latest.current;
    const json = JSON.stringify(snapshot);
    setStatus("saving");
    const work = (async () => {
      try {
        const result = await savePublicPageDraft({ organisationSlug: slug, document: snapshot });
        if (result.ok) {
          setBaseline(json);
          setSavedAt(result.data ? new Date(result.data.savedAt) : new Date());
          setError(null);
          setFieldErrors({});
          setStatus(JSON.stringify(latest.current) === json ? "saved" : "pending");
          saved.current?.();
        } else {
          setError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
          setStatus(result.fieldErrors && Object.keys(result.fieldErrors).length ? "invalid" : "error");
        }
      } catch {
        setError("Couldn't reach the server. Check your connection; your changes are kept here.");
        setStatus("error");
      }
    })();
    inFlight.current = work;
    await work;
    inFlight.current = null;
  }, [slug]);

  const cancel = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // Each change restarts the wait; the save itself reads the newest document.
  useEffect(() => {
    if (!enabled || !dirty) return;
    cancel();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void save();
    }, SAVE_DELAY_MS);
    return cancel;
  }, [serialised, dirty, enabled, save, cancel]);

  const markSaved = useCallback((saved: PageDocument, at: Date | null = new Date()) => {
    cancel();
    setBaseline(JSON.stringify(saved));
    setStatus("saved");
    setError(null);
    setFieldErrors({});
    if (at) setSavedAt(at);
  }, [cancel]);

  return {
    status: dirty ? (status === "saved" ? "pending" : status) : status === "saving" ? "saving" : "saved" as DraftStatus,
    dirty,
    error,
    fieldErrors,
    setFieldErrors,
    savedAt,
    /** Save now (Retry), waiting for any save already running. */
    saveNow: () => {
      cancel();
      return save();
    },
    cancel,
    markSaved,
  };
}
