"use client";

import { memo, useDeferredValue, useSyncExternalStore, type ReactNode } from "react";
import { Monitor, Moon, Smartphone, Sun } from "lucide-react";
import { PageSections, type PageOrg, type PageUnit } from "@/components/public/PageSections";
import type { PublicPlan } from "@/components/public/PlanCards";
import type { PublicCounts, SampleCard } from "@/lib/publicPage/live";
import type { PageDocument } from "@/lib/publicPage/sections";
import { accentStyle } from "@/lib/theme/accent";
import { cn } from "@/lib/cn";
import styles from "./preview.module.css";

type Mode = "light" | "dark";
type Width = "desktop" | "phone";
const STORAGE_KEY = "swo.publicPagePreview";

/** A pressed-or-not button group with 44px targets (the kit's segmented control is shorter). */
function ToggleButtons<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string; icon: ReactNode }>; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-control border border-line bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-control px-3.5 text-sm font-semibold transition-colors duration-(--sw-dur-fast) ease-sw [&_svg]:size-4",
            value === option.value ? "bg-panel text-ink shadow-segment" : "text-ink-muted hover:text-ink",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Re-renders only when the deferred document changes, so toggling light/dark or width never re-draws the sections. */
const Sections = memo(PageSections);

type Choice = { mode: Mode; width: Width };
const DEFAULTS: Choice = { mode: "light", width: "desktop" };
/** This visit's choice, for when storage is unavailable. */
let memoryChoice: Partial<Choice> = {};
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(value: string | null): Partial<Choice> {
  try {
    const saved = JSON.parse(value ?? "null") as { mode?: unknown; width?: unknown } | null;
    if (!saved) return {};
    return { mode: saved.mode === "dark" ? "dark" : "light", width: saved.width === "phone" ? "phone" : "desktop" };
  } catch {
    return {};
  }
}

/**
 * The live preview: the same sections as /o/[slug], inert, in the page's accent, in light or dark (whatever the
 * app's own theme) and at desktop or phone width. The choice is remembered in this browser only.
 */
export function PreviewPane({ document, org, plans, units, takingMembers, counts, sampleCard, fallbackAccent }: {
  document: PageDocument;
  org: PageOrg;
  plans: PublicPlan[];
  units: PageUnit[];
  takingMembers: boolean;
  counts: PublicCounts | null;
  sampleCard: SampleCard | null;
  fallbackAccent: string;
}) {
  // The server renders the defaults; the browser's saved choice applies after hydration.
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const choice = { ...DEFAULTS, ...memoryChoice, ...parse(stored) };
  const { mode, width } = choice;
  // Typing in the editor stays urgent; the preview catches up when the browser is idle.
  const shown = useDeferredValue(document);
  const save = (patch: Partial<Choice>) => {
    memoryChoice = { ...choice, ...patch };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryChoice));
    } catch {
      // Storage can be unavailable (private windows); the choice then lasts for this visit.
    }
    listeners.forEach((listener) => listener());
  };
  const setMode = (next: Mode) => save({ mode: next });
  const setWidth = (next: Width) => save({ width: next });

  return (
    <section aria-labelledby="preview-heading" className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-48px)] xl:self-start">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="preview-heading" className="mr-auto text-h4 text-ink">Preview</h2>
        <ToggleButtons label="Preview theme" value={mode} onChange={setMode} options={[{ value: "light", label: "Light", icon: <Sun aria-hidden /> }, { value: "dark", label: "Dark", icon: <Moon aria-hidden /> }]} />
        <ToggleButtons label="Preview width" value={width} onChange={setWidth} options={[{ value: "desktop", label: "Desktop", icon: <Monitor aria-hidden /> }, { value: "phone", label: "Phone", icon: <Smartphone aria-hidden /> }]} />
      </div>
      <div className="min-h-0 overflow-y-auto rounded-xl border border-line bg-surface">
        <div
          data-mode={mode}
          className={cn("sw-accent-scope sw-display-headings @container", styles.frame, mode === "dark" ? "dark sw-preview-dark" : "sw-preview-light", width === "phone" ? cn(styles.phone, "my-4 rounded-xl border border-line px-4 py-6") : "p-5 sm:p-8")}
          style={accentStyle(document.accentColor ?? fallbackAccent)}
          inert
        >
          <Sections document={shown} org={org} plans={plans} units={units} takingMembers={takingMembers} preview counts={counts} sampleCard={sampleCard} />
        </div>
      </div>
      <p className="text-caption text-ink-muted">Buttons and links don&apos;t work here. Videos show as placeholders until the page is live.</p>
    </section>
  );
}
