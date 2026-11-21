"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ChevronDown, MapPin } from "lucide-react";
import { Chip } from "@/components/ui/display";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { SearchField } from "@/components/ui/search-field";
import { cn } from "@/lib/cn";

export type AreaScopeItem = { id: string; name: string; code: string; level: number; levelName: string; parentId: string | null; live: boolean; hasDraft: boolean; pending: boolean };

/** At most this many rows at once; search narrows a long list. */
const SHOWN_LIMIT = 100;

/** What an area's card design looks like today, in words (colour never stands alone). */
export function areaStatus(area: Pick<AreaScopeItem, "live" | "hasDraft" | "pending">) {
  if (area.pending) return { tone: "warning" as const, label: "Waiting for approval" };
  if (area.live) return { tone: "success" as const, label: "Own design" };
  if (area.hasDraft) return { tone: "neutral" as const, label: "Draft" };
  return null;
}

/**
 * Choose an area (unit) whose own card design to edit: a button that opens a searchable list of the areas in the
 * viewer's reach, in tree order, indented by level, each with its level, code and whether it has its own design,
 * a draft or one waiting for approval. Search matches the name, code or level; the arrow keys move between rows.
 */
export function AreaScopePicker({ base, areas, unitId }: { base: string; areas: AreaScopeItem[]; unitId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const selected = areas.find((area) => area.id === unitId) ?? null;
  const withDesign = areas.filter((area) => area.live || area.pending).length;
  const parentName = useMemo(() => new Map(areas.map((area) => [area.id, area.name])), [areas]);
  const text = query.trim().toLowerCase();
  const matches = text ? areas.filter((area) => [area.name, area.code, area.levelName].some((value) => value.toLowerCase().includes(text))) : areas;
  const shown = matches.slice(0, SHOWN_LIMIT);
  const minLevel = Math.min(...areas.map((area) => area.level));

  const rows = () => [...(list.current?.querySelectorAll<HTMLAnchorElement>("a[data-area]") ?? [])];
  const fromSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    rows()[0]?.focus();
  };
  const inList = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const all = rows();
    const at = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? all.length - 1 : at + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) list.current?.parentElement?.querySelector<HTMLInputElement>("input")?.focus();
    else all[Math.min(next, all.length - 1)]?.focus();
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-current={selected ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-control border px-3.5 text-[14px] transition-colors duration-(--sw-dur-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]",
            selected ? "border-primary bg-primary font-semibold text-on-primary" : "border-line bg-panel text-ink hover:bg-muted",
          )}
        >
          <MapPin aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{selected ? `${selected.name} (${selected.levelName})` : "Choose an area"}</span>
          {!selected && withDesign ? <span className="text-caption text-ink-muted">· {withDesign} with {withDesign === 1 ? "its" : "their"} own</span> : null}
          <ChevronDown aria-hidden className="size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[min(380px,calc(100vw-32px))] flex-col gap-3">
        <div>
          <p className="text-label text-ink">Design for an area</p>
          <p className="text-caption text-ink-muted">Members in an area, and the areas under it without their own, use its design before any plan design.</p>
        </div>
        <SearchField aria-label="Search areas by name, code or level" placeholder="Search areas" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={fromSearch} clearOnEscape={false} autoFocus />
        {shown.length === 0 ? <p className="text-caption text-ink-muted">No area matches that.</p> : null}
        {shown.length > 0 ? (
          <ul ref={list} aria-label="Areas" onKeyDown={inList} className="-mx-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto px-1 py-0.5">
            {shown.map((area) => {
              const status = areaStatus(area);
              const current = area.id === unitId;
              return (
                <li key={area.id}>
                  <Link
                    data-area
                    href={`${base}?unit=${encodeURIComponent(area.id)}`}
                    aria-current={current ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    style={text ? undefined : { paddingLeft: `${0.75 + (area.level - minLevel) * 1.25}rem` }}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-md py-1.5 pr-2 pl-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]",
                      current && "bg-surface",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("truncate text-body-ui text-ink", current && "font-semibold")}>{area.name}</span>
                      <span className="truncate text-caption text-ink-muted">
                        {area.levelName} · <span className="code-text">{area.code}</span>
                        {text && area.parentId && parentName.has(area.parentId) ? ` · in ${parentName.get(area.parentId)}` : ""}
                      </span>
                    </span>
                    {status ? <Chip size="sm" tone={status.tone}>{status.label}</Chip> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
        {matches.length > shown.length ? <p className="text-caption text-ink-muted">Showing {shown.length} of {matches.length}. Search to find the rest.</p> : null}
      </PopoverContent>
    </Popover>
  );
}
