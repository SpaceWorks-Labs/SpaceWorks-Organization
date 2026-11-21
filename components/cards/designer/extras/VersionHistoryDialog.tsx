"use client";

import { useEffect, useState } from "react";
import { getCardDesignVersion, listCardDesignVersions, type CardVersionEntry } from "@/app/actions/card-versions";
import { Button } from "@/components/ui/button";
import { Callout, Chip, EmptyState } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import type { CardDesign, CardSide } from "@/lib/cards/design/presets";
import { ScaledCard } from "../../ScaledCard";
import { formatWhen, keepKeysInside, PREVIEW_BRANDING, PREVIEW_HOLDER } from "./shared";

type Target = { organisationSlug: string; planId: string | null; roleId: string | null; unitId: string | null };

/**
 * Saved drafts and approved versions of this design, newest first, with a preview of the chosen one.
 * Restoring puts it in the editor (one undo step); autosave makes it the draft, which the owner still approves.
 * Mount it when it opens, so each opening loads the list afresh.
 */
export function VersionHistoryDialog({ open, onOpenChange, target, side, onRestore }: { open: boolean; onOpenChange: (open: boolean) => void; target: Target; side: CardSide; onRestore: (design: CardDesign) => void }) {
  const [versions, setVersions] = useState<CardVersionEntry[] | null>(null);
  const [chosen, setChosen] = useState<{ id: string; design: CardDesign | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { organisationSlug, planId, roleId, unitId } = target;

  useEffect(() => {
    if (!open) return;
    let live = true;
    void listCardDesignVersions({ organisationSlug, planId, roleId, unitId }).then((result) => {
      if (!live) return;
      if (result.ok) setVersions(result.data?.versions ?? []);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [open, organisationSlug, planId, roleId, unitId]);

  const choose = async (id: string) => {
    setChosen({ id, design: null });
    setError(null);
    const result = await getCardDesignVersion({ organisationSlug, planId, roleId, unitId, versionId: id });
    if (result.ok && result.data) setChosen((current) => (current?.id === id ? { id, design: result.data!.design } : current));
    else if (!result.ok) setError(result.error);
  };

  const design = chosen?.design ?? null;
  const shown = design ? design[side === "back" && design.backEnabled ? "back" : "front"] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" onKeyDown={keepKeysInside}>
        <DialogHeader title="Version history" description="Drafts are kept every 10 minutes while you edit, and every approved design is kept. Each design keeps its 30 newest versions." />
        <DialogBody className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
          {error ? <Callout tone="danger" role="alert" className="md:col-span-2">{error}</Callout> : null}
          {versions === null && !error ? (
            <div className="flex min-h-40 items-center justify-center md:col-span-2"><Spinner label="Loading versions" /></div>
          ) : versions && versions.length === 0 ? (
            <EmptyState title="No versions yet" className="md:col-span-2">Versions appear here once this design has been saved or approved.</EmptyState>
          ) : versions ? (
            <>
              <ul aria-label="Versions" className="flex max-h-[420px] flex-col gap-1 overflow-y-auto">
                {versions.map((version) => (
                  <li key={version.id}>
                    <button
                      type="button"
                      aria-pressed={chosen?.id === version.id}
                      onClick={() => void choose(version.id)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-(--sw-dur-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]",
                        chosen?.id === version.id ? "border-ink bg-subtle" : "border-line bg-canvas hover:bg-subtle",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-ui font-semibold text-ink">{formatWhen(version.createdAt)}</span>
                        <span className="block truncate text-caption text-ink-muted">{version.createdBy ?? "A former team member"}</span>
                      </span>
                      <Chip size="sm" tone={version.kind === "APPROVED" ? "success" : "neutral"}>{version.kind === "APPROVED" ? "Approved" : "Draft"}</Chip>
                    </button>
                  </li>
                ))}
              </ul>
              <div aria-live="polite" className="flex flex-col items-center gap-2 rounded-lg bg-subtle p-3">
                {shown ? (
                  <>
                    <span className="block w-full" style={{ maxWidth: shown.widthMm > shown.heightMm ? 236 : 140 }}>
                      <ScaledCard settings={shown} holder={PREVIEW_HOLDER} branding={PREVIEW_BRANDING} />
                    </span>
                    <span className="text-caption text-ink-muted">{side === "back" && design?.backEnabled ? "Back" : "Front"}, with sample details</span>
                  </>
                ) : chosen ? (
                  <Spinner label="Loading preview" />
                ) : (
                  <p className="text-caption text-ink-muted">Choose a version to preview it.</p>
                )}
              </div>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!design}
            onClick={() => {
              if (!design) return;
              onRestore(design);
              onOpenChange(false);
            }}
          >
            Restore to draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
