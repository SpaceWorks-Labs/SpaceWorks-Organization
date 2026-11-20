"use client";

import { Search } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

/** Asks the one DocsSearchPalette on the page to open. */
export const DOCS_SEARCH_EVENT = "swo:docs-search";

const noSubscribe = () => () => {};

/** "Ctrl K", or "⌘K" on Apple devices (the server always says "Ctrl K"; the browser corrects it after hydration). */
function useShortcutLabel() {
  return useSyncExternalStore(noSubscribe, () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K"), () => "Ctrl K");
}

/** The search trigger: a wide field on the docs home, a compact one above the sidebar. */
export function DocsSearchButton({ variant = "bar" }: { variant?: "hero" | "bar" }) {
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(DOCS_SEARCH_EVENT))}
      aria-keyshortcuts="Control+K Meta+K"
      className={cn(
        "flex w-full items-center gap-3 rounded-control border border-line-strong bg-panel text-left text-ink-muted transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2",
        variant === "hero" ? "text-body min-h-14 max-w-[36rem] px-4" : "text-label min-h-11 px-3",
      )}
    >
      <Search size={variant === "hero" ? 20 : 18} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{variant === "hero" ? "Search pages and sections…" : "Search docs"}</span>
      <kbd className="text-caption hidden shrink-0 rounded-md border border-line bg-muted px-1.5 py-0.5 font-semibold md:inline">{shortcut}</kbd>
    </button>
  );
}
