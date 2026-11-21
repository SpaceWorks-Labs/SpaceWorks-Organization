"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, History, ListTree, Monitor, Moon, MoreHorizontal, PanelsTopLeft, Plus, Redo2, Smartphone, Sun, Tablet, Undo2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Chip, type ChipTone } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { ToggleButtons, type PreviewDevice, type PreviewMode } from "./previewChoice";
import type { DraftStatus } from "./useDraftAutosave";

const STATUS: Record<DraftStatus, { tone: ChipTone; label: string }> = {
  saved: { tone: "success", label: "Draft saved" },
  pending: { tone: "neutral", label: "Unsaved changes" },
  saving: { tone: "neutral", label: "Saving…" },
  invalid: { tone: "danger", label: "Not saved: fix the marked sections" },
  error: { tone: "danger", label: "Couldn't save" },
};

export type PanelMode = "library" | "settings" | "page" | "outline";

/**
 * The editor's toolbar: where the page stands (published or not, draft saved or not), undo and redo, the canvas's
 * device and theme, the panels (add block, page settings, sections), templates, history, and Publish with its
 * quieter partners in a menu.
 */
export function EditorToolbar({ slug, canEdit, publishedLabel, changedSincePublish, status, saveError, canUndo, canRedo, mode, device, panel, templates, busy, hasDraft, onRetry, onUndo, onRedo, onMode, onDevice, onPanel, onHistory, onPublish, onDiscard, onUnpublish }: {
  slug: string;
  canEdit: boolean;
  publishedLabel: string | null;
  changedSincePublish: boolean;
  status: DraftStatus;
  saveError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  mode: PreviewMode;
  device: PreviewDevice;
  panel: PanelMode;
  /** The template chooser's own button. */
  templates: ReactNode;
  busy: boolean;
  hasDraft: boolean;
  onRetry: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onMode: (mode: PreviewMode) => void;
  onDevice: (device: PreviewDevice) => void;
  onPanel: (panel: PanelMode) => void;
  onHistory: () => void;
  onPublish: () => void;
  onDiscard: () => void;
  onUnpublish: () => void;
}) {
  const state = STATUS[status];
  return (
    <div className="flex flex-col gap-3 border-b border-line bg-panel px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        {publishedLabel ? <Chip tone={changedSincePublish ? "warning" : "success"}>{changedSincePublish ? `Published ${publishedLabel} · draft has changes` : `Published ${publishedLabel}`}</Chip> : <Chip tone="neutral">Not published: visitors see the plain page</Chip>}
        {canEdit ? (
          <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
            <Chip size="sm" tone={state.tone}>{state.label}</Chip>
            {status === "error" ? <Button type="button" size="sm" variant="ghost" onClick={onRetry}>Try again</Button> : null}
          </span>
        ) : null}
        {status === "error" && saveError ? <span className="text-caption text-danger-fg">{saveError}</span> : null}
        <a href={`/o/${slug}`} target="_blank" rel="noopener" className="ml-auto inline-flex min-h-11 items-center gap-1 text-label text-ink-secondary underline-offset-4 hover:text-ink hover:underline">
          Open the live page
          <ArrowUpRight aria-hidden className="size-4" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <div role="group" aria-label="History" className="flex items-center gap-1">
            <IconButton label="Undo" aria-keyshortcuts="Control+Z Meta+Z" disabled={!canUndo} onClick={onUndo}><Undo2 /></IconButton>
            <IconButton label="Redo" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" disabled={!canRedo} onClick={onRedo}><Redo2 /></IconButton>
          </div>
        ) : null}
        <ToggleButtons iconOnly label="Preview width" value={device} onChange={onDevice} options={[{ value: "desktop", label: "Desktop", icon: <Monitor aria-hidden /> }, { value: "tablet", label: "Tablet", icon: <Tablet aria-hidden /> }, { value: "phone", label: "Phone", icon: <Smartphone aria-hidden /> }]} />
        <ToggleButtons iconOnly label="Preview theme" value={mode} onChange={onMode} options={[{ value: "light", label: "Light", icon: <Sun aria-hidden /> }, { value: "dark", label: "Dark", icon: <Moon aria-hidden /> }]} />
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          {canEdit ? <Button type="button" size="sm" variant={panel === "library" ? "primary" : "secondary"} aria-pressed={panel === "library"} onClick={() => onPanel("library")}><Plus aria-hidden className="size-4" />Add block</Button> : null}
          <Button type="button" size="sm" variant="ghost" aria-pressed={panel === "outline"} onClick={() => onPanel("outline")}><ListTree aria-hidden className="size-4" />Sections</Button>
          <Button type="button" size="sm" variant="ghost" aria-pressed={panel === "page"} onClick={() => onPanel("page")}><PanelsTopLeft aria-hidden className="size-4" />Page settings</Button>
          {canEdit ? templates : null}
          <Button type="button" size="sm" variant="ghost" onClick={onHistory}><History aria-hidden className="size-4" />History</Button>
          {canEdit ? (
            <>
              <Button type="button" size="sm" variant="primary" loading={busy} onClick={onPublish}>Publish</Button>
              {hasDraft || publishedLabel ? (
                <Menu>
                  <MenuTrigger asChild><IconButton label="More publishing actions"><MoreHorizontal /></IconButton></MenuTrigger>
                  <MenuContent>
                    {hasDraft ? <MenuItem onSelect={onDiscard} description="Go back to the published page">Discard draft…</MenuItem> : null}
                    {publishedLabel ? <MenuItem danger onSelect={onUnpublish} description="Visitors see the plain page">Unpublish…</MenuItem> : null}
                  </MenuContent>
                </Menu>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
