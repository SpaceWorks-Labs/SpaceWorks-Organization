"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CornerDownLeft, FileText, Hash, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { searchItemStyle } from "@/components/ui/search-field";
import { cn } from "@/lib/cn";
import { highlight, queryWords, searchDocs, type SearchHit } from "@/lib/docs/search";
import type { SearchDoc } from "@/lib/docs/search-index";
import { DOCS_SEARCH_EVENT } from "./DocsSearchButton";

function Marked({ text, words }: { text: string; words: readonly string[] }) {
  return (
    <>
      {highlight(text, words).map((part, index) =>
        part.match ? <mark key={index} className="rounded-sm bg-highlight-soft text-ink">{part.text}</mark> : <span key={index}>{part.text}</span>,
      )}
    </>
  );
}

/** Opens on the search buttons, Ctrl+K or ⌘K anywhere, and "/" outside text fields. */
function useOpenTriggers(open: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(DOCS_SEARCH_EVENT, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(DOCS_SEARCH_EVENT, open);
    };
  }, [open]);
}

/**
 * The docs search: a keyboard-first combobox over titles, headings and each section's first words. The index is a
 * generated static module (lib/docs/search-index.ts) loaded the first time the palette opens.
 */
export function DocsSearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<readonly SearchDoc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const openPalette = useMemo(() => () => setOpen(true), []);
  useOpenTriggers(openPalette);

  useEffect(() => {
    if (!open || index) return;
    import("@/lib/docs/search-index").then((module) => setIndex(module.SEARCH_INDEX)).catch(() => setFailed(true));
  }, [open, index]);

  const words = useMemo(() => queryWords(query), [query]);
  const results = useMemo(() => (index ? searchDocs(index, query, 12) : []), [index, query]);

  const go = (hit: SearchHit | undefined) => {
    if (!hit) return;
    setOpen(false);
    router.push(hit.href);
  };
  const optionId = (position: number) => `${listId}-${position}`;
  const status = failed
    ? "The search could not load. Check your connection and try again."
    : !query.trim()
      ? "Type to search every page and section."
      : !index
        ? "Loading the search…"
        : results.length
          ? null
          : `Nothing matches “${query.trim()}”. Try a shorter word.`;

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <DialogContent size="md" hideClose className="top-[10vh] max-h-[76vh] translate-y-0" onOpenAutoFocus={(event) => { event.preventDefault(); input.current?.focus(); }}>
        <DialogPrimitive.Title className="sr-only">Search the documentation</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">Type a word, move with the arrow keys and press Enter to open a result.</DialogPrimitive.Description>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={20} aria-hidden="true" className="shrink-0 text-ink-muted" />
          <input
            ref={input}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results.length ? optionId(active) : undefined}
            aria-label="Search the documentation"
            placeholder="Search pages and sections"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive((at) => Math.min(at + 1, results.length - 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive((at) => Math.max(at - 1, 0)); }
              if (event.key === "Enter") { event.preventDefault(); go(results[active]); }
            }}
            className="text-body-l min-h-[60px] min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
          />
          <kbd className="text-caption hidden rounded-md border border-line bg-muted px-1.5 py-0.5 font-semibold text-ink-muted sm:inline">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className={cn("overflow-y-auto p-2", !results.length && "hidden")}>
          {results.map((hit, position) => {
            const Icon = hit.kind === "page" ? FileText : Hash;
            return (
              <li
                key={hit.key}
                id={optionId(position)}
                role="option"
                aria-selected={position === active}
                style={searchItemStyle(position)}
                onMouseMove={() => setActive(position)}
                onClick={() => go(hit)}
                className="sw-search-item flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] px-3 py-2.5 aria-selected:bg-accent-soft"
              >
                <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-muted" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-semibold text-ink"><Marked text={hit.title} words={words} /></span>
                  <span className="text-label truncate text-ink-muted"><Marked text={hit.context} words={words} /></span>
                </span>
                {position === active && <CornerDownLeft size={16} aria-hidden="true" className="mt-1 shrink-0 text-ink-muted" />}
              </li>
            );
          })}
        </ul>
        {status && <p role="status" className="text-body-ui px-5 py-8 text-center text-ink-muted">{status}</p>}
        <p className="text-caption hidden gap-5 border-t border-line px-4 py-2.5 text-ink-muted sm:flex">
          <span>↑ ↓ to move</span><span>Enter to open</span><span>Esc to close</span>
        </p>
      </DialogContent>
    </Dialog>
  );
}
