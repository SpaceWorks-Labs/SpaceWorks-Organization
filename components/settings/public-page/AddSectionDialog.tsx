"use client";

import { SECTION_GROUPS, SECTION_LABELS, SECTION_TYPES, type SectionType } from "@/lib/publicPage/sections";
import { Dialog, DialogBody, DialogContent, DialogHeader } from "@/components/ui/dialog";

/** Every section type, grouped, each a full-width button with its description. A page has one hero. */
export function AddSectionDialog({ open, hasHero, onOpenChange, onAdd }: {
  open: boolean;
  hasHero: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (type: SectionType) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader title="Add a section" description="It goes at the end of the page. Move it afterwards." />
        <DialogBody className="flex flex-col gap-6 pb-6">
          {SECTION_GROUPS.map((group) => (
            <section key={group} aria-labelledby={`add-${group.replace(/\W+/g, "-")}`} className="flex flex-col gap-2.5">
              <h3 id={`add-${group.replace(/\W+/g, "-")}`} className="text-label font-semibold text-ink-muted">{group}</h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SECTION_TYPES.filter((type) => SECTION_LABELS[type].group === group).map((type) => {
                  const taken = type === "hero" && hasHero;
                  return (
                    <li key={type}>
                      <button
                        type="button"
                        disabled={taken}
                        onClick={() => onAdd(type)}
                        className="flex min-h-14 w-full flex-col items-start gap-0.5 rounded-lg border border-line bg-panel px-4 py-3 text-left transition-colors duration-(--sw-dur-fast) ease-sw hover:bg-muted disabled:cursor-not-allowed disabled:bg-surface"
                      >
                        <span className={taken ? "text-label font-semibold text-ink-muted" : "text-label font-semibold text-ink"}>{SECTION_LABELS[type].label}</span>
                        <span className="text-caption text-ink-muted">
                          {taken ? "Your page already has a hero. A page has one." : SECTION_LABELS[type].description}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
