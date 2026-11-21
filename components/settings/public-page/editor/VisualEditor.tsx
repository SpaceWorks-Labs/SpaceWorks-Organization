"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { discardPublicPageDraft, publishPublicPage, unpublishPublicPage } from "@/app/actions/public-page";
import { useToast } from "@/components/feedback/ToastProvider";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";
import type { PageOrg, PageUnit } from "@/components/public/PageSections";
import type { PublicPlan } from "@/components/public/PlanCards";
import type { Live } from "@/components/public/sections/SectionBody";
import { Callout } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { statsForSection } from "@/lib/publicPage/blockData";
import type { PublicCounts, SampleCard } from "@/lib/publicPage/live";
import { starterDocument, type PageDocument, type PageSection } from "@/lib/publicPage/sections";
import { DEFAULT_ORG_ACCENT } from "@/lib/theme/accent";
import { sectionName } from "../sectionContent";
import { TemplatePicker } from "../TemplateDialog";
import type { EditorExtras } from "../fields/shared";
import { replaceSection, sectionsWithErrors } from "./documentOps";
import { EditorCanvas, PAGE_TOP } from "./EditorCanvas";
import { EditorPanel, PreviewFrame } from "./EditorPanel";
import { EditorToolbar, type PanelMode } from "./EditorToolbar";
import { usePreviewChoice } from "./previewChoice";
import { useDraftAutosave } from "./useDraftAutosave";
import { useEditorHistory } from "./useEditorHistory";
import { useSectionActions } from "./useSectionActions";
import { VersionHistory } from "./VersionHistory";

type EditorOrg = PageOrg & { slug: string; description: string; accentColor: string | null; status: string; timezone: string; contactEmail: string | null; contactPhone: string | null };

const WIDE = "(min-width: 1024px)";
const subscribeWide = (listener: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

/**
 * The live visual editor for an organisation's public page: the page itself on a canvas (edit text in place, select,
 * drag or move sections), a side panel (section settings, page settings, the block library, the list of sections),
 * and a toolbar (undo, device and theme, templates, history, publish). The draft autosaves; visitors see only what
 * is published. Below 1024px the panel opens as a bottom sheet.
 */
export function VisualEditor({ org, initial, published, publishedLabel, hasDraft: initialDraft, canEdit, plans, units, counts, sampleCard, extras }: {
  org: EditorOrg;
  initial: PageDocument;
  published: PageDocument | null;
  publishedLabel: string | null;
  hasDraft: boolean;
  canEdit: boolean;
  plans: PublicPlan[];
  units: PageUnit[];
  counts: PublicCounts | null;
  sampleCard: SampleCard | null;
  extras: EditorExtras;
}) {
  const { showToast } = useToast();
  const { document, change, undo, redo, canUndo, canRedo, current } = useEditorHistory(initial);
  const [hasDraft, setHasDraft] = useState(initialDraft);
  const markDraft = useCallback(() => setHasDraft(true), []);
  const autosave = useDraftAutosave(org.slug, document, canEdit, markDraft);
  const preview = usePreviewChoice();
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelMode>("outline");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirm, setConfirm] = useState<"publish" | "discard" | "unpublish" | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  useUnsavedChangesGuard(canEdit && autosave.status !== "saved");

  const fallbackAccent = org.accentColor ?? DEFAULT_ORG_ACCENT;
  const errors = autosave.fieldErrors;
  const failed = useMemo(() => new Set(sectionsWithErrors(errors)), [errors]);
  const selected = document.sections.find((section) => section.id === selectedId) ?? null;
  const changedSincePublish = useMemo(() => Boolean(published) && JSON.stringify(published) !== JSON.stringify(document), [published, document]);
  const planChoices = useMemo(() => plans.map((plan) => ({ slug: plan.slug, name: plan.name })), [plans]);
  const contact = useMemo(() => ({ contactEmail: org.contactEmail, contactPhone: org.contactPhone }), [org.contactEmail, org.contactPhone]);

  // The live numbers each block would show, picked from the organisation-wide catalogue as the block is edited.
  const liveStats = useMemo(() => Object.fromEntries(document.sections.flatMap((section) => (section.type === "liveStats" ? [[section.id, statsForSection(section, extras.statsCatalogue)]] : []))), [document.sections, extras.statsCatalogue]);
  const live: Live = useMemo(() => ({ org, plans, units, takingMembers: org.status === "ACTIVE", preview: true, counts, sampleCard, liveStats, areas: extras.areas, area: null }), [org, plans, units, counts, sampleCard, liveStats, extras.areas]);

  const openPanel = useCallback((next: PanelMode) => {
    setPanel(next);
    if (!wide) setSheetOpen(true);
  }, [wide]);
  const select = useCallback((id: string | null, openSettings = false) => {
    setSelectedId(id);
    if (!id) return;
    if (openSettings) openPanel(id === PAGE_TOP ? "page" : "settings");
    else if (wide) setPanel((now) => (now === "library" ? now : id === PAGE_TOP ? "page" : "settings"));
  }, [openPanel, wide]);
  const actions = useSectionActions({ document, change, contact, selectedId, onSelect: select, onOpenSettings: (id) => select(id, true), announce: setAnnouncement });

  const publish = async () => {
    setBusy(true);
    autosave.cancel();
    const snapshot = current();
    const result = await publishPublicPage({ organisationSlug: org.slug, document: snapshot }).catch(() => null);
    setBusy(false);
    setConfirm(null);
    if (!result?.ok) {
      const fieldErrors = result && !result.ok ? result.fieldErrors ?? {} : {};
      autosave.setFieldErrors(fieldErrors);
      const first = sectionsWithErrors(fieldErrors)[0];
      if (first !== undefined && snapshot.sections[first]) select(snapshot.sections[first]!.id, true);
      return showToast(result && !result.ok ? result.error : "Couldn't publish. Check your connection and try again.", "error");
    }
    autosave.markSaved(snapshot);
    setHasDraft(false);
    showToast("Published. Your page is live.", "success");
  };

  const discard = async () => {
    setBusy(true);
    autosave.cancel();
    const result = await discardPublicPageDraft({ organisationSlug: org.slug }).catch(() => null);
    setBusy(false);
    setConfirm(null);
    if (!result?.ok) return showToast(result && !result.ok ? result.error : "Couldn't discard the draft. Try again.", "error");
    const back = published ?? starterDocument(org);
    change(back);
    autosave.markSaved(back);
    setHasDraft(false);
    setSelectedId(null);
    showToast(published ? "Draft discarded. The editor shows the published page; Undo brings your draft back." : "Draft discarded.", "success");
  };

  const unpublish = async () => {
    setBusy(true);
    if (autosave.dirty) await autosave.saveNow();
    const result = await unpublishPublicPage({ organisationSlug: org.slug }).catch(() => null);
    setBusy(false);
    setConfirm(null);
    if (!result?.ok) return showToast(result && !result.ok ? result.error : "Couldn't unpublish. Try again.", "error");
    setHasDraft(true);
    showToast("Unpublished. Visitors see the plain page; your content is kept as a draft.", "success");
  };

  const fields = { slug: org.slug, plans: planChoices, disabled: !canEdit, extras };
  const panelContent = (
    <EditorPanel
      {...fields}
      panel={panel}
      document={document}
      section={selected}
      errors={errors}
      failed={failed}
      fallbackAccent={fallbackAccent}
      onPanel={setPanel}
      onDocument={(patch, coalesce) => change((now) => ({ ...now, ...patch }), coalesce)}
      onSection={(next: PageSection, coalesce) => change((now) => replaceSection(now, next), coalesce)}
      onOpen={(id) => select(id, true)}
      onMove={actions.move}
      onInsert={(type) => {
        actions.insert(type);
        setSheetOpen(false);
      }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
      {!canEdit ? <Callout tone="info">Only organisation-wide owners and managers can edit the public page. You can look around; nothing you do here is saved.</Callout> : null}
      {autosave.status === "invalid" ? <Callout tone="danger" role="alert">Your latest changes aren&apos;t saved: {failed.size === 1 ? "one section needs" : `${failed.size} sections need`} attention. They&apos;re marked on the page; open each one to see what to change.</Callout> : null}
      <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <EditorToolbar
          slug={org.slug}
          canEdit={canEdit}
          publishedLabel={publishedLabel}
          changedSincePublish={changedSincePublish}
          status={autosave.status}
          saveError={autosave.error}
          canUndo={canUndo}
          canRedo={canRedo}
          mode={preview.mode}
          device={preview.device}
          panel={panel}
          templates={<TemplatePicker document={document} org={org} disabled={!canEdit} onApply={(next, label) => { change(next); setSelectedId(null); showToast(`${label} template applied. It autosaves as your draft; publish when it's ready.`, "success"); }} />}
          busy={busy && confirm === "publish"}
          hasDraft={hasDraft}
          onRetry={() => void autosave.saveNow()}
          onUndo={undo}
          onRedo={redo}
          onMode={preview.setMode}
          onDevice={preview.setDevice}
          onPanel={openPanel}
          onHistory={() => setHistoryOpen(true)}
          onPublish={() => setConfirm("publish")}
          onDiscard={() => setConfirm("discard")}
          onUnpublish={() => setConfirm("unpublish")}
        />
        <div className="grid h-[calc(100dvh-180px)] min-h-[560px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
          <div className="min-h-0 overflow-y-auto" aria-label="Page canvas" role="region">
            <EditorCanvas
              document={document}
              live={live}
              mode={preview.mode}
              device={preview.device}
              accent={document.accentColor ?? fallbackAccent}
              selectedId={selectedId}
              failed={failed}
              canEdit={canEdit}
              onSelect={select}
              onAction={actions.act}
              onMove={actions.move}
              onFieldChange={actions.editField}
              onAddBlock={(afterId) => { setSelectedId(afterId); openPanel("library"); }}
            />
          </div>
          {wide ? <aside aria-labelledby="editor-panel-title" className="min-h-0 overflow-y-auto border-l border-line bg-panel">{panelContent}</aside> : null}
        </div>
      </div>
      {!wide ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent edge="bottom" title={panel === "settings" && selected ? `Settings for ${sectionName(selected)}` : "Editor panel"}>{panelContent}</SheetContent>
        </Sheet>
      ) : null}

      <VersionHistory
        open={historyOpen}
        slug={org.slug}
        timezone={org.timezone}
        disabled={!canEdit}
        isPublished={Boolean(publishedLabel)}
        onOpenChange={setHistoryOpen}
        renderPreview={(version) => <PreviewFrame document={version} live={live} mode={preview.mode} accent={fallbackAccent} />}
        onRestored={({ document: restored, savedAt }) => {
          change(restored);
          autosave.markSaved(restored, savedAt);
          setHasDraft(true);
          setSelectedId(null);
          showToast("Version restored into your draft. Publish to make it live; Undo brings back what you had.", "success");
        }}
      />
      <ConfirmDialog open={confirm === "publish"} title="Publish this page?" message="Visitors to your public page and your area pages see it straight away." confirmLabel="Publish" destructive={false} loading={busy} onCancel={() => setConfirm(null)} onConfirm={() => void publish()} />
      <ConfirmDialog open={confirm === "discard"} title="Discard your draft?" message={published ? "The editor goes back to the published page. Undo brings the draft back while you're here." : "The editor goes back to a fresh start."} confirmLabel="Discard draft" loading={busy} onCancel={() => setConfirm(null)} onConfirm={() => void discard()} />
      <ConfirmDialog open={confirm === "unpublish"} title="Unpublish the page?" message="Visitors see the plain page with your plans and join buttons. Your content stays here as a draft." confirmLabel="Unpublish" loading={busy} onCancel={() => setConfirm(null)} onConfirm={() => void unpublish()} />
      <ConfirmDialog
        open={Boolean(actions.removing)}
        title={`Delete ${actions.removing ? sectionName(actions.removing) : "this section"}?`}
        message="What you wrote or uploaded in it goes from your draft. Undo brings it back; visitors see no change until you publish."
        confirmLabel="Delete section"
        onCancel={actions.cancelRemove}
        onConfirm={actions.confirmRemove}
      />
    </div>
  );
}
