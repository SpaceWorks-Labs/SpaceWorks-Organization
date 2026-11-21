"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { relayoutLayers } from "@/lib/cards/design/editor/relayout";
import { copySideLayout, duplicateSide } from "@/lib/cards/design/editor/sideCopy";
import { elementBoxHeightMm, layoutFlags, type CardElement, type CardLayoutFlags, type CardSideSettings } from "@/lib/cards/design/elements";
import { isDefaultLayout, layoutForPaper } from "@/lib/cards/design/geometry";
import { MAX_LAYERS, type CardLayer } from "@/lib/cards/design/layerTypes";
import { normalizeCardSide, TEXT_LIMITS } from "@/lib/cards/design/normalize";
import { applyCardPreset, type CardDesign, type CardSide } from "@/lib/cards/design/presets";
import { documentColours, replaceColour } from "@/lib/cards/design/library/colours";
import { applyCardTemplate } from "@/lib/cards/design/templates";
import { orgAccentHex } from "@/lib/cards/palette";
import { formatCardNumberFrom, normalizeNumberFormat, numberFormatError } from "@/lib/cards/numbering";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import { CardCanvas } from "../CardCanvas";
import { CardFontFaces } from "../cardFonts";
import { SAFE_MARGIN_MM } from "../canvasInteraction";
import { ApprovalBar, type ApprovalState } from "./ApprovalBar";
import { SaveStatusPill } from "./controls";
import { DesignerToolbar } from "./DesignerToolbar";
import { ArrangePanel } from "./editor/ArrangePanel";
import { useLiveBrandKit, type BrandKit } from "./editor/brandKit";
import { EditorViewport } from "./editor/EditorViewport";
import { PositionPanel } from "./editor/PositionPanel";
import { SettingsAside } from "./editor/SettingsAside";
import { ShortcutsDialog } from "./editor/ShortcutsDialog";
import { InactiveSide, SideTools } from "./editor/SideTools";
import { imageAspect, useArtworkUploads } from "./editor/useArtworkUploads";
import { isElement, useCardEditor } from "./editor/useCardEditor";
import { ViewControls } from "./editor/ViewControls";
import { DesignerExtras } from "./extras/DesignerExtras";
import { Inspector, itemVisibility } from "./Inspector";
import { LayerInspector } from "./LayerInspector";
import { LayersPanel } from "./LayersPanel";
import type { Numbering } from "./NumberingSection";
import { sampleHolder, sampleNumberUnits, SAMPLES, type Sample } from "./sample";
import type { DesignerField } from "./SideSettings";
import { useDesignAutosave } from "./useDesignAutosave";
import { useDesignHistory } from "./useDesignHistory";
import { useLayerEditing } from "./useLayerEditing";

/**
 * Front and back designer for member cards. Each side is edited on a zoomable, to-scale canvas with
 * rulers, guides and smart snapping; several layers can be selected, arranged, grouped and copied
 * (editor/). The selected item's inspector, an Arrange and a Position panel and the layers list sit
 * on the right, settings and the element library on the left. The whole design autosaves as a draft
 * of the organisation default, one plan (`planId`), one member role (`roleId`) or one area (`unitId`), which reaches
 * members' cards once the owner approves it.
 */
export function CardDesigner({ organisationSlug, organisationName, planId, planName, roleId, roleName, unitId = null, initialDesign, branding: initialBranding, fields, numbering: initialNumbering, approval, unitLevels, brandKit = null }: {
  organisationSlug: string;
  organisationName: string;
  planId: string | null;
  planName: string;
  roleId: string | null;
  roleName: string;
  /** The area (unit) whose own design this is; null for every other scope. */
  unitId?: string | null;
  initialDesign: CardDesign;
  branding: CardBranding;
  fields: DesignerField[];
  /** Card number prefix and pattern; null when editing a plan's design, which numbers nothing. */
  numbering: Numbering | null;
  approval: ApprovalState;
  /** The organisation's level names, top first (Organisation.unitLevels), for the unit placeholders and samples. */
  unitLevels?: string[];
  /** The organisation's brand kit (logos, colours, fonts), offered in colour fields and the element library. */
  brandKit?: BrandKit | null;
}) {
  const [edited, setEdited] = useState(false);
  const [design, setDesign] = useState(initialDesign);
  const [side, setSide] = useState<CardSide>("front");
  const [both, setBoth] = useState(false);
  const [branding, setBranding] = useState(initialBranding);
  const [sample, setSample] = useState<Sample>("latin");
  const [previewHolder, setPreviewHolder] = useState<CardHolder | null>(null);
  const [numbering, setNumbering] = useState<Numbering>(initialNumbering ?? { prefix: "", format: "" });
  const autosave = useDesignAutosave({ design, numbering }, { organisationSlug, planId, roleId, unitId, numbers: Boolean(initialNumbering) });
  const history = useDesignHistory();
  const { setError } = autosave;
  const uploads = useArtworkUploads({ organisationSlug, planId, roleId, unitId, onError: setError });
  const latestDesign = () => autosave.current().design;
  const context = useMemo(() => ({ organisationName, planName }), [organisationName, planName]);

  const commit = (next: CardDesign) => {
    autosave.set({ design: next });
    setDesign(next);
    setEdited(true);
  };
  /** A change that undoes as its own step (`coalesce`: merged with edits just before it). */
  const change = (next: CardDesign, coalesce = false) => {
    history.checkpoint(latestDesign(), coalesce);
    commit(next);
  };
  const restore = (next: CardDesign | null) => {
    if (next) commit(next);
  };

  const current = design[side];
  const sampleNumber = initialNumbering && !numberFormatError(numbering.format)
    ? formatCardNumberFrom(normalizeNumberFormat(numbering.format), { prefix: numbering.prefix || "M", seq: 42, memberNumber: 7, year: new Date().getFullYear(), ...sampleNumberUnits(unitLevels) })
    : "M-0042";
  const holder = previewHolder ?? sampleHolder(SAMPLES[sample], planName, roleName, sampleNumber, fields, unitLevels, organisationName);
  const usedColours = documentColours(design);
  const kit = useLiveBrandKit(brandKit);

  /** Replace the side being edited, normalised; `undoStep` false while a drag is under way. */
  const writeSide = (next: CardSideSettings, undoStep: boolean | "coalesce") => {
    const normalized = normalizeCardSide(next, context);
    // Text stays exactly as typed (including empty) while editing.
    for (const [key, max] of TEXT_LIMITS) normalized[key] = next[key].slice(0, max);
    const nextDesign = { ...latestDesign(), [side]: normalized };
    if (undoStep === false) commit(nextDesign);
    else change(nextDesign, undoStep === "coalesce");
  };
  const update = (patch: Partial<CardSideSettings>) => writeSide({ ...latestDesign()[side], ...patch }, "coalesce");
  const sideNow = () => latestDesign()[side];
  const visible = itemVisibility(current, branding);
  const editor = useCardEditor({
    current,
    side: sideNow,
    writeSide,
    visible,
    undo: () => restore(history.undo(latestDesign())),
    redo: () => restore(history.redo(latestDesign())),
    onError: setError,
    both,
  });
  const layers = useLayerEditing({ side: sideNow, writeSide, select: editor.setSelection });
  const selected = editor.selection.length === 1 ? editor.selection[0]! : null;
  const selectedLayer = editor.selectedLayers.length === 1 && selected === editor.selectedLayers[0]!.id ? editor.selectedLayers[0] : undefined;

  const move = (element: CardElement, xMm: number, yMm: number) => {
    const size = current.elementSizes[element];
    const height = elementBoxHeightMm(element, current.elementSizes);
    const snap = (value: number) => Math.round(value / current.gridSizeMm) * current.gridSizeMm;
    const next = {
      xMm: Math.min(Math.max(0, current.widthMm - size - SAFE_MARGIN_MM), Math.max(0, snap(xMm))),
      yMm: Math.min(Math.max(0, current.heightMm - height - SAFE_MARGIN_MM), Math.max(0, snap(yMm))),
    };
    const at = current.elementPositions[element];
    if (at.xMm !== next.xMm || at.yMm !== next.yMm) writeSide({ ...latestDesign()[side], elementPositions: { ...current.elementPositions, [element]: next } }, false);
  };

  /** Optional items: an untouched layout reflows to make room; a hand-adjusted one keeps every position. */
  const toggleItem = (flag: keyof CardLayoutFlags, on: boolean, element: CardElement) => {
    const flags = layoutFlags(current);
    if (isDefaultLayout(current, flags)) update({ [flag]: on, ...layoutForPaper(current.template, current.widthMm, current.heightMm, { ...flags, [flag]: on }) });
    else update({ [flag]: on });
    if (on) editor.setSelection([element]);
  };

  /** Both sides share one card size; turning the card reflows the built-in items and re-lays the layers in proportion. */
  const setOrientation = (landscape: boolean) => {
    const [widthMm, heightMm] = landscape ? [85.6, 54] : [54, 85.6];
    const resize = (settings: CardSideSettings) => ({ ...settings, widthMm, heightMm, ...layoutForPaper(settings.template, widthMm, heightMm, layoutFlags(settings)), layers: relayoutLayers(settings.layers, settings, { widthMm, heightMm }) });
    change({ ...latestDesign(), front: resize(latestDesign().front), back: resize(latestDesign().back) });
  };

  const other: CardSide = side === "front" ? "back" : "front";
  const switchSide = (next: CardSide) => {
    setSide(next);
    editor.setSelection([next === "front" ? "name" : "footer"]);
  };
  /** One undo step each; layers get new ids, and design-level settings (such as printing a back) stay. */
  const copyLayout = () => change({ ...latestDesign(), [other]: copySideLayout(latestDesign()[side], latestDesign()[other]) });
  const duplicate = () => change({ ...latestDesign(), [other]: duplicateSide(latestDesign()[side]) });

  const uploadWatermark = async (file: File | null) => {
    const url = await uploads.uploadWatermark(file);
    if (url === undefined) return;
    setBranding((value) => ({ ...value, watermarkUrl: url }));
    setEdited(true);
  };
  const uploadArtwork = uploads.uploadArtwork;

  return (
    <div onKeyDown={editor.onKeyDown} className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <CardFontFaces fonts="all" />
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <SegmentedControl<CardSide> ariaLabel="Card side" value={side} onValueChange={switchSide} options={[{ value: "front", label: "Front" }, { value: "back", label: "Back" }]} />
        <SideTools side={side} both={both} onBoth={setBoth} onCopyLayout={copyLayout} onDuplicate={duplicate} />
        <SegmentedControl<Sample> ariaLabel="Sample name" size="sm" value={sample} onValueChange={(next) => { setSample(next); setPreviewHolder(null); }} options={[{ value: "latin", label: "Latin" }, { value: "malayalam", label: "മലയാളം" }, { value: "devanagari", label: "हिन्दी" }]} />
        <div className="ml-auto flex items-center gap-2" aria-live="polite">
          <DesignerExtras organisationSlug={organisationSlug} planId={planId} roleId={roleId} unitId={unitId} design={design} side={side} onRestore={(next) => change(next)} onPreviewHolder={setPreviewHolder} />
          <SaveStatusPill status={autosave.status} />
          {autosave.status === "error" ? <Button size="sm" variant="secondary" onClick={() => void autosave.save()}>Try again</Button> : null}
        </div>
      </header>
      <ApprovalBar state={approval} pending={approval.pending || edited} scope={{ organisationSlug, planId, roleId, unitId }} flush={autosave.save} />
      {autosave.error ? <div className="px-4 pt-3"><Callout tone="danger" role="alert">{autosave.error}</Callout></div> : null}

      {/* DOM order is the reading order below 1280px (preview, selected item, settings); from xl the grid places
          settings left, preview centre and the selected item right. */}
      <div className="flex min-h-0 flex-col xl:grid xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <section aria-label="Card preview" className="flex min-h-[360px] min-w-0 flex-col bg-subtle xl:col-start-2 xl:row-start-1">
          <DesignerToolbar
            full={current.layers.length >= MAX_LAYERS}
            uploading={uploads.uploading}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onAdd={(kind) => layers.add(kind)}
            onAddImage={async (file) => { const url = await uploadArtwork(file); if (url) layers.add("image", { url, aspect: await imageAspect(file) }); }}
            onUndo={() => restore(history.undo(latestDesign()))}
            onRedo={() => restore(history.redo(latestDesign()))}
          />
          <ViewControls zoom={editor.zoom} overlays={editor.overlays} onOverlays={editor.setOverlays} guides={editor.guides} onHelp={() => editor.setHelpOpen(true)} />
          <EditorViewport
            zoom={editor.zoom}
            widthMm={current.widthMm}
            heightMm={current.heightMm}
            rulers={editor.overlays.rulers && !both}
            onStartGuide={(axis, event, frame) => editor.guides.startDrag(axis, null, event, frame, editor.zoom.pxPerMm)}
            onCanvasPointerDown={editor.transform.onCanvasPointerDown}
          >
            {(pxPerMm) => {
              const active = <div data-active-card><CardCanvas settings={current} holder={holder} branding={branding} pxPerMm={pxPerMm} interaction={{ selection: editor.selection, onSelect: editor.select, onBeginChange: () => history.checkpoint(latestDesign(), false), onMove: move, onLayerPointerDown: editor.transform.onLayerPointerDown, showGrid: editor.overlays.grid, overlay: editor.overlay }} /></div>;
              if (!both) return active;
              const inactive = <InactiveSide side={other} settings={design[other]} holder={holder} branding={branding} pxPerMm={pxPerMm} onActivate={() => switchSide(other)} />;
              return <div className="flex items-start gap-12">{side === "front" ? <>{active}{inactive}</> : <>{inactive}{active}</>}</div>;
            }}
          </EditorViewport>
          <p className="border-t border-line bg-canvas px-4 py-2 text-caption text-ink-muted">
            {side === "back" && !design.backEnabled ? "The back is turned off, so cards print the front only." : "Select an item to edit it; Shift-click or drag across the card to select several. Arrow keys move the selection (Shift for 5 mm); hold Alt while dragging to place freely. Sample details shown."}
          </p>
        </section>

        <aside aria-label="Selected item and layers" className="flex flex-col gap-6 border-line p-4 sm:p-5 xl:col-start-3 xl:row-start-1 xl:max-h-[920px] xl:overflow-y-auto xl:border-l">
          <ArrangePanel layers={current.layers} selected={editor.selectedLayers} order={current.order} selection={editor.selection} actions={editor.actions} />
          {editor.selectedLayers.length ? <PositionPanel layers={current.layers} selected={editor.selectedLayers} actions={editor.actions} /> : null}
          {selectedLayer ? (
            <LayerInspector layer={selectedLayer} card={current} orgAccent={orgAccentHex(branding.orgAccent)} uploading={uploads.uploading} unitLevels={unitLevels} brandColours={kit?.colours} brandFonts={kit?.fonts} documentColours={usedColours} onReplaceColour={(from, to) => change(replaceColour(latestDesign(), from, to), true)} onChange={(patch) => layers.change(selectedLayer.id, patch, "coalesce")} onReplaceImage={async (file) => { const url = await uploadArtwork(file); if (url) layers.change(selectedLayer.id, { url } as Partial<CardLayer>, true); }} />
          ) : editor.selectedLayers.length ? null : (
            <Inspector settings={current} branding={branding} selected={isElement(selected) ? selected : "name"} onSelect={(key) => editor.setSelection([key])} update={update} />
          )}
          <LayersPanel order={current.order} layers={current.layers} visible={visible} selection={editor.selection} onSelect={editor.select} onLayerChange={(id, patch) => layers.change(id, patch, true)} />
        </aside>

        <SettingsAside
          design={design}
          side={side}
          current={current}
          branding={branding}
          fields={fields}
          holder={holder}
          context={context}
          uploading={uploads.uploading}
          numbering={initialNumbering ? { value: numbering, scope: roleId ? "role" : unitId ? "area" : "organisation", unitLevels, onChange: (next) => { setNumbering(next); autosave.set({ numbering: next }); setEdited(true); } } : null}
          brandKit={kit}
          documentColours={usedColours}
          organisationSlug={organisationSlug}
          unitLevels={unitLevels}
          onChooseDesign={(next) => { change(next); editor.setSelection(["name"]); }}
          full={current.layers.length >= MAX_LAYERS}
          onPreset={(preset) => change(applyCardPreset(latestDesign(), preset, context))}
          onTemplate={(id) => { change(applyCardTemplate(latestDesign(), id, context)); editor.setSelection(["name"]); }}
          onOrientation={setOrientation}
          onBackEnabled={(backEnabled) => change({ ...latestDesign(), backEnabled })}
          update={update}
          toggleItem={toggleItem}
          onWatermark={(file) => void uploadWatermark(file)}
          onUploadBackground={async (file) => { const url = await uploadArtwork(file); if (url) update({ background: { ...latestDesign()[side].background, imageUrl: url } }); }}
          onUploadImage={uploadArtwork}
          onInsert={editor.actions.insert}
          onInsertText={editor.actions.insertText}
        />
      </div>
      <ShortcutsDialog open={editor.helpOpen} onOpenChange={editor.setHelpOpen} />
    </div>
  );
}
