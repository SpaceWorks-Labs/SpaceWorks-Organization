"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCertificateDesign } from "@/app/actions/certificate-designs";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { CardCanvas } from "@/components/cards/CardCanvas";
import { CardFontFaces } from "@/components/cards/cardFonts";
import { SaveStatusPill } from "@/components/cards/designer/controls";
import { DesignerToolbar } from "@/components/cards/designer/DesignerToolbar";
import { ArrangePanel } from "@/components/cards/designer/editor/ArrangePanel";
import { useLiveBrandKit, type BrandKit } from "@/components/cards/designer/editor/brandKit";
import { EditorViewport } from "@/components/cards/designer/editor/EditorViewport";
import { PositionPanel } from "@/components/cards/designer/editor/PositionPanel";
import { ShortcutsDialog } from "@/components/cards/designer/editor/ShortcutsDialog";
import { imageAspect } from "@/components/cards/designer/editor/useArtworkUploads";
import { useCardEditor } from "@/components/cards/designer/editor/useCardEditor";
import { ViewControls } from "@/components/cards/designer/editor/ViewControls";
import { LayerInspector } from "@/components/cards/designer/LayerInspector";
import { DesignerNounProvider } from "@/components/cards/designer/wording";
import { LayersPanel } from "@/components/cards/designer/LayersPanel";
import { useDesignHistory } from "@/components/cards/designer/useDesignHistory";
import { useLayerEditing } from "@/components/cards/designer/useLayerEditing";
import { relayoutLayers } from "@/lib/cards/design/editor/relayout";
import { CARD_ELEMENTS, type CardElement, type CardSideSettings } from "@/lib/cards/design/elements";
import { documentColours, replaceColour } from "@/lib/cards/design/library/colours";
import { MAX_LAYERS, type CardLayer } from "@/lib/cards/design/layerTypes";
import { orgAccentHex } from "@/lib/cards/palette";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import { normalizeCertificateSide } from "@/lib/certificates/design";
import { pageDimensions, type CertificatePage } from "@/lib/certificates/pages";
import { withCertificateText, type CertificateTextValues } from "@/lib/certificates/placeholders";
import { CertificateApprovalBar, type CertificateApproval } from "./CertificateApprovalBar";
import { CertificateSettingsAside } from "./CertificateSettingsAside";
import { DraftDownloadMenu } from "./DraftDownloadMenu";
import { certificatePlaceholderOptions } from "./placeholders";
import { useCertificateArtwork } from "./useCertificateArtwork";
import { useCertificateAutosave, type CertificateDetails } from "./useCertificateAutosave";

/** A certificate has no built-in card items: only layers draw. */
const NO_ITEMS = Object.fromEntries(CARD_ELEMENTS.map((element) => [element, false])) as Record<CardElement, boolean>;
const noMove = () => {};

export type CertificateDesignerProps = {
  organisationSlug: string;
  organisationName: string;
  unitLevels: string[];
  design: { id: string; name: string; typeLabel: string; numberPrefix: string; numberFormat: string } & CertificatePage;
  side: CardSideSettings;
  branding: CardBranding;
  sample: { holder: CardHolder; values: CertificateTextValues };
  approval: CertificateApproval;
  pageSizes: Array<{ value: string; label: string }>;
  orientations: Array<{ value: string; label: string }>;
  brandKit: BrandKit | null;
};

/**
 * The certificate designer: one page (A4 or Letter, either way round) edited with the card designer's layer tools
 * (to-scale canvas, rulers, guides, snapping, multi-select, arrange, layers list and undo), with none of the
 * card's built-in items. The page autosaves as a draft that issued certificates use once the owner approves it.
 * The preview fills the placeholders with a fictional member.
 */
export function CertificateDesigner({ organisationSlug, organisationName, unitLevels, design, side: initialSide, branding, sample, approval, pageSizes, orientations, brandKit }: CertificateDesignerProps) {
  const router = useRouter();
  const page = useMemo<CertificatePage>(() => ({ pageSize: design.pageSize, orientation: design.orientation }), [design.pageSize, design.orientation]);
  const context = useMemo(() => ({ organisationName }), [organisationName]);
  const target = { organisationSlug, designId: design.id };
  const [side, setSide] = useState(initialSide);
  const [details, setDetails] = useState<CertificateDetails>({ name: design.name, typeLabel: design.typeLabel, numberPrefix: design.numberPrefix, numberFormat: design.numberFormat });
  const [edited, setEdited] = useState(false);
  const [pageBusy, setPageBusy] = useState(false);
  const autosave = useCertificateAutosave({ side: initialSide, details }, target);
  const { setError } = autosave;
  const history = useDesignHistory<CardSideSettings>();
  const uploads = useCertificateArtwork({ organisationSlug, onError: setError });
  const kit = useLiveBrandKit(brandKit);
  const placeholders = useMemo(() => certificatePlaceholderOptions(unitLevels), [unitLevels]);
  const latestSide = () => autosave.current().side;

  const commit = (next: CardSideSettings) => {
    autosave.set({ side: next });
    setSide(next);
    setEdited(true);
  };
  const change = (next: CardSideSettings, coalesce = false) => {
    history.checkpoint(latestSide(), coalesce);
    commit(next);
  };
  const restore = (next: CardSideSettings | null) => {
    if (next) commit(next);
  };
  /** Replace the page, normalised (built-in items stay off, the size stays the page's); `undoStep` false mid-drag. */
  const writeSide = (next: CardSideSettings, undoStep: boolean | "coalesce") => {
    const normalized = normalizeCertificateSide(next, context, page);
    if (undoStep === false) commit(normalized);
    else change(normalized, undoStep === "coalesce");
  };
  const update = (patch: Partial<CardSideSettings>) => writeSide({ ...latestSide(), ...patch }, "coalesce");
  const undo = () => restore(history.undo(latestSide()));
  const redo = () => restore(history.redo(latestSide()));
  const editor = useCardEditor({ current: side, side: latestSide, writeSide, visible: NO_ITEMS, undo, redo, onError: setError, initialSelection: [] });
  const layers = useLayerEditing({ side: latestSide, writeSide, select: editor.setSelection });
  const selected = editor.selectedLayers.length === 1 ? editor.selectedLayers[0] : undefined;
  const usedColours = documentColours({ front: side, back: side });
  const full = side.layers.length >= MAX_LAYERS;
  const preview = withCertificateText(side, sample.values);

  const changeDetails = (next: CertificateDetails) => {
    setDetails(next);
    autosave.set({ details: next });
    setEdited(true);
  };
  /** A new page size or orientation: layers re-laid in proportion, saved, then the designer reloads at that size. */
  const changePage = async (next: CertificatePage) => {
    if (next.pageSize === page.pageSize && next.orientation === page.orientation) return;
    setPageBusy(true);
    try {
      if (!(await autosave.save())) return;
      const size = pageDimensions(next.pageSize, next.orientation);
      const current = latestSide();
      const relaid = { ...current, ...size, layers: relayoutLayers(current.layers, current, size) };
      const result = await saveCertificateDesign({ ...target, design: relaid as unknown as Record<string, unknown>, ...next });
      if (!result.ok) return setError(result.error);
      router.refresh();
    } catch {
      setError("The page didn't change. Check your connection and try again.");
    } finally {
      setPageBusy(false);
    }
  };

  return (
    <DesignerNounProvider value="certificate">
    <div onKeyDown={editor.onKeyDown} className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <CardFontFaces fonts="all" />
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-label font-semibold text-ink" title={details.name}>{details.name || "Untitled design"}</p>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <SaveStatusPill status={autosave.status} />
          {autosave.status === "error" ? <Button size="sm" variant="secondary" onClick={() => void autosave.save()}>Try again</Button> : null}
          <DraftDownloadMenu organisationSlug={organisationSlug} designId={design.id} flush={autosave.save} onError={setError} />
        </div>
      </header>
      <CertificateApprovalBar state={approval} pending={approval.pending || !approval.live || edited} target={target} designName={details.name} flush={autosave.save} onDeleted={() => router.push(`/dashboard/${organisationSlug}/certificates`)} />
      {autosave.error ? <div className="px-4 pt-3"><Callout tone="danger" role="alert">{autosave.error}</Callout></div> : null}

      {/* DOM order is the reading order below 1280px (page, selected layer, settings); from xl the grid places
          settings left, the page centre and the selected layer right. */}
      <div className="flex min-h-0 flex-col xl:grid xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <section aria-label="Certificate page" className="flex min-h-[360px] min-w-0 flex-col bg-subtle xl:col-start-2 xl:row-start-1">
          <DesignerToolbar
            full={full}
            uploading={uploads.uploading}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onAdd={(kind) => layers.add(kind)}
            onAddImage={async (file) => { const url = await uploads.uploadArtwork(file); if (url) layers.add("image", { url, aspect: await imageAspect(file) }); }}
            onUndo={undo}
            onRedo={redo}
          />
          <ViewControls zoom={editor.zoom} overlays={editor.overlays} onOverlays={editor.setOverlays} guides={editor.guides} onHelp={() => editor.setHelpOpen(true)} />
          <EditorViewport
            zoom={editor.zoom}
            widthMm={side.widthMm}
            heightMm={side.heightMm}
            rulers={editor.overlays.rulers}
            onStartGuide={(axis, event, frame) => editor.guides.startDrag(axis, null, event, frame, editor.zoom.pxPerMm)}
            onCanvasPointerDown={editor.transform.onCanvasPointerDown}
          >
            {(pxPerMm) => (
              <div data-active-card>
                <CardCanvas settings={preview} holder={sample.holder} branding={branding} pxPerMm={pxPerMm} interaction={{ selection: editor.selection, onSelect: editor.select, onBeginChange: () => history.checkpoint(latestSide(), false), onMove: noMove, onLayerPointerDown: editor.transform.onLayerPointerDown, showGrid: editor.overlays.grid, overlay: editor.overlay }} />
              </div>
            )}
          </EditorViewport>
          <p className="border-t border-line bg-canvas px-4 py-2 text-caption text-ink-muted">
            Select a layer to edit it; Shift-click or drag across the page to select several. Arrow keys move the selection (Shift for 5 mm); hold Alt while dragging to place freely. Sample details shown.
          </p>
        </section>

        <aside aria-label="Selected layer and layers" className="flex flex-col gap-6 border-line p-4 sm:p-5 xl:col-start-3 xl:row-start-1 xl:max-h-[920px] xl:overflow-y-auto xl:border-l">
          <ArrangePanel layers={side.layers} selected={editor.selectedLayers} order={side.order} selection={editor.selection} actions={editor.actions} />
          {editor.selectedLayers.length ? <PositionPanel layers={side.layers} selected={editor.selectedLayers} actions={editor.actions} /> : null}
          {selected ? (
            <LayerInspector layer={selected} card={side} orgAccent={orgAccentHex(branding.orgAccent)} uploading={uploads.uploading} unitLevels={unitLevels} brandColours={kit?.colours} brandFonts={kit?.fonts} documentColours={usedColours} placeholders={placeholders} onReplaceColour={(from, to) => change(replaceColour({ front: latestSide(), back: latestSide() }, from, to).front, true)} onChange={(patch) => layers.change(selected.id, patch, "coalesce")} onReplaceImage={async (file) => { const url = await uploads.uploadArtwork(file); if (url) layers.change(selected.id, { url } as Partial<CardLayer>, true); }} />
          ) : editor.selectedLayers.length ? null : (
            <p className="rounded-xl border border-line p-3.5 text-caption text-ink-muted">Select a layer on the page or in the list to change it. Add text, pictures and shapes from the toolbar or the Elements tab.</p>
          )}
          <LayersPanel order={side.order} layers={side.layers} visible={NO_ITEMS} selection={editor.selection} onSelect={editor.select} onLayerChange={(id, patch) => layers.change(id, patch, true)} />
        </aside>

        <CertificateSettingsAside
          current={side}
          branding={branding}
          sample={sample}
          unitLevels={unitLevels}
          uploading={uploads.uploading}
          full={full}
          brandKit={kit}
          documentColours={usedColours}
          details={{ details, page, pageSizes, orientations, unitLevels, pageBusy, onChange: changeDetails, onPage: (next) => void changePage(next) }}
          layouts={{ context, page, disabled: pageBusy, onChoose: (next) => { change(normalizeCertificateSide({ ...next, colorMode: latestSide().colorMode }, context, page)); editor.setSelection([]); } }}
          update={update}
          onUploadBackground={async (file) => { const url = await uploads.uploadArtwork(file); if (url) update({ background: { ...latestSide().background, imageUrl: url } }); }}
          onUploadImage={uploads.uploadArtwork}
          onInsert={editor.actions.insert}
          onInsertText={editor.actions.insertText}
        />
      </div>
      <ShortcutsDialog open={editor.helpOpen} onOpenChange={editor.setHelpOpen} />
    </div>
    </DesignerNounProvider>
  );
}
