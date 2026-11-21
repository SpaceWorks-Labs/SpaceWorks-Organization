"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Eye, History, RotateCcw } from "lucide-react";
import { listPublicPageVersions, previewPublicPageVersion, restorePublicPageVersion, type PublicPageVersionRow } from "@/app/actions/public-page";
import { LogoLoader } from "@/components/brand/LogoLoader";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { readPageDocument, type PageDocument } from "@/lib/publicPage/sections";

type Restored = { document: PageDocument; savedAt: Date };

/**
 * Version history: the last 20 published versions, newest first, with who published each and when. Preview one as
 * it looked, or restore it into the draft (the live page doesn't change until you publish).
 */
export function VersionHistory({ open, slug, timezone, disabled, isPublished, onOpenChange, renderPreview, onRestored }: {
  open: boolean;
  slug: string;
  timezone: string;
  disabled: boolean;
  /** Whether the newest version is what visitors see now. */
  isPublished: boolean;
  onOpenChange: (open: boolean) => void;
  renderPreview: (document: PageDocument) => ReactNode;
  onRestored: (restored: Restored) => void;
}) {
  const [versions, setVersions] = useState<PublicPageVersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ row: PublicPageVersionRow; document: PageDocument | null } | null>(null);
  const [restoring, setRestoring] = useState<PublicPageVersionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(iso));

  const load = useCallback(async () => {
    setError(null);
    setVersions(null);
    try {
      const result = await listPublicPageVersions({ organisationSlug: slug });
      if (result.ok && result.data) setVersions(result.data.versions);
      else setError(result.ok ? "Couldn't load the versions." : result.error);
    } catch {
      setError("Couldn't load the versions. Check your connection.");
    }
  }, [slug]);

  useEffect(() => {
    // Loads each time the drawer opens, so a version published a moment ago is listed.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the load sets its own pending and result state
    if (open) void load();
  }, [open, load]);

  const openPreview = async (row: PublicPageVersionRow) => {
    setPreview({ row, document: null });
    const result = await previewPublicPageVersion({ organisationSlug: slug, versionId: row.id }).catch(() => null);
    if (result?.ok && result.data) setPreview({ row, document: readPageDocument(result.data.document) });
    else {
      setPreview(null);
      setError(result && !result.ok ? result.error : "Couldn't load that version. Check your connection.");
    }
  };

  const restore = async () => {
    if (!restoring) return;
    setBusy(true);
    const result = await restorePublicPageVersion({ organisationSlug: slug, versionId: restoring.id }).catch(() => null);
    setBusy(false);
    setRestoring(null);
    if (result?.ok && result.data) {
      setPreview(null);
      onOpenChange(false);
      onRestored({ document: readPageDocument(result.data.document), savedAt: new Date(result.data.savedAt) });
    } else setError(result && !result.ok ? result.error : "Couldn't restore that version. Check your connection.");
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent edge="right" title="Version history" showTitle description="The last 20 published versions" className="w-[min(420px,92vw)]">
          <div className="flex flex-col gap-4 p-5">
            <p className="text-body-ui text-ink-muted">Each time you publish, the page is kept here. Restoring copies a version into your draft; visitors see it only once you publish.</p>
            {error ? (
              <Callout tone="danger" role="alert">
                <span className="flex flex-col items-start gap-2">{error}<Button type="button" size="sm" variant="secondary" onClick={() => void load()}>Try again</Button></span>
              </Callout>
            ) : null}
            {versions === null && !error ? <LogoLoader label="Loading versions" size={48} className="min-h-32 py-6" /> : null}
            {versions && versions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
                <History aria-hidden className="size-6 text-ink-muted" />
                <p className="text-body-ui text-ink">No published versions yet.</p>
                <p className="text-caption text-ink-muted">Publish your page and each version is kept here.</p>
              </div>
            ) : null}
            {versions?.length ? (
              <ol className="flex flex-col gap-2">
                {versions.map((row, index) => (
                  <li key={row.id} className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
                    <div className="flex flex-col">
                      <span className="text-label font-semibold text-ink">{when(row.publishedAt)}{index === 0 && isPublished ? " · live now" : ""}</span>
                      <span className="text-caption text-ink-muted">{row.publishedByName ? `Published by ${row.publishedByName}` : "Publisher not recorded"} · {row.sections} {row.sections === 1 ? "section" : "sections"}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => void openPreview(row)}><Eye aria-hidden className="size-4" />Preview</Button>
                      <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setRestoring(row)}><RotateCcw aria-hidden className="size-4" />Restore to draft</Button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={Boolean(preview)} onOpenChange={(next) => { if (!next) setPreview(null); }}>
        <DialogContent size="xl">
          <DialogHeader title={preview ? `Published ${when(preview.row.publishedAt)}` : "Version preview"} description="How the page looked when this version was published. Links don't work here." />
          <DialogBody className="flex flex-col gap-4 pb-6">
            {preview?.document ? <div className="max-h-[60dvh] overflow-y-auto rounded-xl border border-line">{renderPreview(preview.document)}</div> : <LogoLoader label="Loading the version" size={48} />}
            {preview ? <div className="flex justify-end"><Button type="button" variant="primary" disabled={disabled || !preview.document} onClick={() => setRestoring(preview.row)}><RotateCcw aria-hidden className="size-4" />Restore to draft</Button></div> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(restoring)}
        title="Restore this version to your draft?"
        message={restoring ? `Your draft is replaced with the page as published ${when(restoring.publishedAt)}. Undo brings your current draft back; visitors see no change until you publish.` : undefined}
        confirmLabel="Restore to draft"
        destructive={false}
        loading={busy}
        onCancel={() => setRestoring(null)}
        onConfirm={() => void restore()}
      />
    </>
  );
}
