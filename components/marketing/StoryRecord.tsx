"use client";

import { BadgeCheck, Check, CreditCard, IdCard, RefreshCw, RotateCcw, UserPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { SAMPLE, STORY, type StoryTone } from "./storyData";

const ICONS = { join: UserPlus, approve: BadgeCheck, pay: CreditCard, card: IdCard, renew: RefreshCw } as const;
const TONES: Record<StoryTone, string> = {
  warning: "bg-warning-mark text-on-warning-mark",
  info: "bg-info-mark text-on-info-mark",
  success: "bg-success-mark text-on-success-mark",
};

/**
 * The sample membership record beside the story. Every row is drawn from the start (unreached ones held back),
 * so the pinned card never changes height. `reached` counts the steps done (1–5); the button moves the story on,
 * and on wide screens the story scrolls the matching step into place.
 */
export function StoryRecord({ reached, onReach }: { reached: number; onReach: (reached: number) => void }) {
  const done = reached >= STORY.length;
  const status = STORY[reached - 1].status;
  return (
    <section aria-labelledby="story-record-title" className="overflow-hidden rounded-xl border border-line bg-panel text-ink">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h3 id="story-record-title" className="text-title text-ink">Membership · {SAMPLE.member}</h3>
          <p className="mt-0.5 text-label text-ink-muted">{SAMPLE.plan}</p>
        </div>
        <span aria-live="polite" aria-atomic="true" className={cn("inline-flex min-h-7 shrink-0 items-center rounded-full px-3 text-caption font-semibold", TONES[status.tone])}>{status.label}</span>
      </div>
      <ol className="grid">
        {STORY.map((step, index) => {
          const Icon = ICONS[step.key as keyof typeof ICONS];
          const open = index < reached;
          return (
            <li key={step.key} className="sw-land-record-step" data-pending={open ? undefined : ""} data-new={index === reached - 1 || undefined}>
              <span className="sw-land-record-dot" aria-hidden>{open ? <Icon className="size-4" /> : null}</span>
              <div className="min-w-0">
                <p className="sw-land-record-label font-semibold text-ink">
                  {step.state}
                  {open ? null : <span className="sr-only"> (not reached yet)</span>}
                </p>
                <p className="text-label text-ink-muted">{step.who}</p>
                <p className="sw-land-record-proof mt-1 flex items-start gap-1.5 text-label text-ink">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success-solid" />
                  {step.proof}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-4">
        <p className="text-label text-ink-muted">{done ? "Five entries, written in order, never edited." : `Sample record · ${SAMPLE.organisation}`}</p>
        {done ? (
          <button type="button" onClick={() => onReach(1)} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-panel px-4 text-label font-semibold text-ink transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted">
            <RotateCcw aria-hidden className="size-4" />
            Start again
          </button>
        ) : (
          <button type="button" onClick={() => onReach(reached + 1)} className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-label font-semibold text-on-primary transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-primary-hover">
            Next step: {STORY[reached].state}
          </button>
        )}
      </div>
    </section>
  );
}
