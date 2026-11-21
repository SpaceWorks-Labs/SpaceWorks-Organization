"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * The canvas's theme (light or dark, whatever the app's own) and device width (desktop, tablet or phone), remembered
 * in this browser only. Storage can be unavailable (private windows); the choice then lasts for this visit.
 */

export type PreviewMode = "light" | "dark";
export type PreviewDevice = "desktop" | "tablet" | "phone";
export type PreviewChoice = { mode: PreviewMode; device: PreviewDevice };

const STORAGE_KEY = "swo.publicPagePreview";
const DEFAULTS: PreviewChoice = { mode: "light", device: "desktop" };
let memoryChoice: Partial<PreviewChoice> = {};
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

function parse(value: string | null): Partial<PreviewChoice> {
  try {
    const saved = JSON.parse(value ?? "null") as { mode?: unknown; device?: unknown; width?: unknown } | null;
    if (!saved) return {};
    const device = saved.device ?? saved.width;
    return { mode: saved.mode === "dark" ? "dark" : "light", device: device === "phone" || device === "tablet" ? device : "desktop" };
  } catch {
    return {};
  }
}

export function usePreviewChoice() {
  // The server renders the defaults; the browser's saved choice applies after hydration.
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const choice: PreviewChoice = { ...DEFAULTS, ...memoryChoice, ...parse(stored) };
  const save = (patch: Partial<PreviewChoice>) => {
    memoryChoice = { ...choice, ...patch };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryChoice));
    } catch {
      // Unavailable storage: the in-memory choice is used.
    }
    listeners.forEach((listener) => listener());
  };
  return { ...choice, setMode: (mode: PreviewMode) => save({ mode }), setDevice: (device: PreviewDevice) => save({ device }) };
}

/** A pressed-or-not button group with 44px targets. Icon-only options keep their name for assistive technology. */
export function ToggleButtons<T extends string>({ label, value, options, onChange, iconOnly = false }: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; icon: ReactNode }>;
  onChange: (value: T) => void;
  iconOnly?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-control border border-line bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          aria-label={iconOnly ? option.label : undefined}
          title={iconOnly ? option.label : undefined}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control text-sm font-semibold transition-colors duration-(--sw-dur-fast) ease-sw [&_svg]:size-4",
            iconOnly ? "px-2.5" : "px-3.5",
            value === option.value ? "bg-panel text-ink shadow-segment" : "text-ink-muted hover:text-ink",
          )}
        >
          {option.icon}
          {iconOnly ? null : option.label}
        </button>
      ))}
    </div>
  );
}
