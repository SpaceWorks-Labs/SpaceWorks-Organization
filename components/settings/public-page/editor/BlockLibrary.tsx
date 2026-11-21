"use client";

import { useId, useState } from "react";
import { MAX_SECTIONS, SECTION_LABELS, type SectionType } from "@/lib/publicPage/sections";
import { Field, SearchInput } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { BLOCK_CATEGORIES, BLOCK_PREVIEWS, blocksFor, type Shape, type Tone } from "./blockCatalog";

const TONE: Record<Tone, string> = { ink: "text-ink", muted: "text-ink-muted", accent: "text-accent", line: "text-line-strong" };

/** A block's small schematic preview (decorative: the name and description beside it say what it is). */
export function BlockPreview({ type, className }: { type: SectionType; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 60" className={cn("h-[60px] w-[100px] shrink-0 rounded-lg border border-line bg-canvas", className)}>
      {BLOCK_PREVIEWS[type].map((shape: Shape, index) => (shape[0] === "r"
        ? <rect key={index} x={shape[1]} y={shape[2]} width={shape[3]} height={shape[4]} rx={Math.min(2, shape[4] / 2)} className={TONE[shape[5]]} fill={shape[5] === "line" ? "none" : "currentColor"} stroke={shape[5] === "line" ? "currentColor" : "none"} strokeWidth={1} />
        : <circle key={index} cx={shape[1]} cy={shape[2]} r={shape[3]} className={TONE[shape[4]]} fill={shape[4] === "line" ? "none" : "currentColor"} stroke={shape[4] === "line" ? "currentColor" : "none"} strokeWidth={1} />))}
    </svg>
  );
}

/**
 * Add block: every block type by category, searchable, each with a preview and a line about it. The new block goes
 * after the selected section (or at the end). A page has one hero and at most MAX_SECTIONS sections.
 */
export function BlockLibrary({ hasHero, count, placement, onInsert }: { hasHero: boolean; count: number; placement: string; onInsert: (type: SectionType) => void }) {
  const [search, setSearch] = useState("");
  const statusId = useId();
  const full = count >= MAX_SECTIONS;
  const groups = BLOCK_CATEGORIES.map((category) => ({ category, types: blocksFor(category, search) })).filter((group) => group.types.length > 0);
  const found = groups.reduce((total, group) => total + group.types.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <Field label="Search blocks" hideLabel>
        <SearchInput value={search} placeholder="Search blocks" aria-describedby={statusId} onChange={(event) => setSearch(event.target.value)} onClear={() => setSearch("")} />
      </Field>
      <p id={statusId} role="status" className="text-caption text-ink-muted">
        {full ? `A page holds up to ${MAX_SECTIONS} sections. Remove one to add another.` : search ? `${found} ${found === 1 ? "block matches" : "blocks match"}. ${placement}` : placement}
      </p>
      {groups.length === 0 ? <p className="text-body-ui text-ink-muted">No blocks match “{search}”. Try another word, or clear the search.</p> : null}
      {groups.map(({ category, types }) => (
        <section key={category} aria-label={category} className="flex flex-col gap-2">
          <h3 className="text-label font-semibold text-ink-muted">{category}</h3>
          <ul className="flex flex-col gap-2">
            {types.map((type) => {
              const taken = type === "hero" && hasHero;
              return (
                <li key={type}>
                  <button
                    type="button"
                    disabled={taken || full}
                    onClick={() => onInsert(type)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-control border border-line bg-panel p-2 pr-3 text-left transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted disabled:cursor-not-allowed disabled:bg-surface"
                  >
                    <BlockPreview type={type} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cn("text-label font-semibold", taken || full ? "text-ink-muted" : "text-ink")}>{SECTION_LABELS[type].label}</span>
                      <span className="text-caption text-ink-muted">{taken ? "Your page already has a hero. A page has one." : SECTION_LABELS[type].description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
