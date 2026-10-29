"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { uploadCardArtwork, uploadCardWatermark } from "@/app/actions/card-design";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { CARD_ELEMENTS, CR80, elementBoxHeightMm, layoutFlags, type CardElement, type CardLayoutFlags, type CardSideSettings } from "@/lib/cards/design/elements";
import { isDefaultLayout, layoutForPaper } from "@/lib/cards/design/geometry";
import { MAX_LAYERS, type CardLayer } from "@/lib/cards/design/layers";
import { normalizeCardSide, TEXT_LIMITS } from "@/lib/cards/design/normalize";
import { applyCardPreset, type CardDesign, type CardSide } from "@/lib/cards/design/presets";
import { applyCardTemplate } from "@/lib/cards/design/templates";
import { orgAccentHex } from "@/lib/cards/palette";
import { formatCardNumberFrom, normalizeNumberFormat, numberFormatError } from "@/lib/cards/numbering";
import type { CardBranding } from "@/lib/cards/types";
import { CardCanvas } from "../CardCanvas";
import { CardFontFaces } from "../cardFonts";
import { SAFE_MARGIN_MM } from "../canvasInteraction";
import { ApprovalBar, type ApprovalState } from "./ApprovalBar";
import { BackgroundSection } from "./BackgroundSection";
import { FitArea, SaveStatusPill, Section, SwitchLine } from "./controls";
import { DesignerToolbar } from "./DesignerToolbar";
import { Inspector, itemVisibility } from "./Inspector";
import { LayerInspector } from "./LayerInspector";
import { LayersPanel } from "./LayersPanel";
import { NumberingSection, type Numbering } from "./NumberingSection";
import { PresetPicker } from "./PresetPicker";
import { sampleHolder, sampleNumberUnits, SAMPLES, type Sample } from "./sample";
import { SideSettings, type DesignerField } from "./SideSettings";
import { TemplateGallery } from "./TemplateGallery";
import { useDesignAutosave } from "./useDesignAutosave";
import { useDesignHistory } from "./useDesignHistory";
import { useLayerEditing } from "./useLayerEditing";

const isElement = (key: string | null): key is CardElement => (CARD_ELEMENTS as readonly string[]).includes(key ?? "");

/**
 * Front and back designer for member cards. Each side is edited on a to-scale canvas with an
 * inspector for the selected item or layer, a layers list and undo. The whole design autosaves as a
 * draft of the organisation default, one plan (`planId`) or one member role (`roleId`), which reaches
 * members' cards once the owner approves it.
 */
export function CardDesigner({ organisationSlug, organisationName, planId, planName, roleId, roleName, initialDesign, branding: initialBranding, fields, numbering: initialNumbering, approval, unitLevels }: {
  organisationSlug: string;
  organisationName: string;
  planId: string | null;
  planName: string;
  roleId: string | null;
  roleName: string;
  initialDesign: CardDesign;
  branding: CardBranding;
  fields: DesignerField[];
  /** Card number prefix and pattern; null when editing a plan's design, which numbers nothing. */
  numbering: Numbering | null;
  approval: ApprovalState;
  /** The organisation's level names, top first (Organisation.unitLevels), for the unit placeholders and samples. */
  unitLevels?: string[];
}) {
  const [edited, setEdited] = useState(false);
  const [design, setDesign] = useState(initialDesign);
  const [side, setSide] = useState<CardSide>("front");
  const [selected, setSelected] = useState<string | null>("name");
  const [branding, setBranding] = useState(initialBranding);
  const [uploading, setUploading] = useState(false);
  const [sample, setSample] = useState<Sample>("latin");
  const [numbering, setNumbering] = useState<Numbering>(initialNumbering ?? { prefix: "", format: "" });
  const autosave = useDesignAutosave({ design, numbering }, { organisationSlug, planId, roleId, numbers: Boolean(initialNumbering) });
  const history = useDesignHistory();
  const { setError } = autosave;
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
    if (!next) return;
    commit(next);
    if (selected && !isElement(selected) && !next[side].layers.some((layer) => layer.id === selected)) setSelected(null);
  };

  const current = design[side];
  const sampleNumber = initialNumbering && !numberFormatError(numbering.format)
    ? formatCardNumberFrom(normalizeNumberFormat(numbering.format), { prefix: numbering.prefix || "M", seq: 42, memberNumber: 7, year: new Date().getFullYear(), ...sampleNumberUnits(unitLevels) })
    : "M-0042";
  const holder = sampleHolder(SAMPLES[sample], planName, roleName, sampleNumber, fields, unitLevels);

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
  const layers = useLayerEditing({ side: () => latestDesign()[side], writeSide, select: setSelected });

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
    if (on) setSelected(element);
  };

  /** Both sides share one card size; turning the card reflows both. */
  const setOrientation = (landscape: boolean) => {
    const [widthMm, heightMm] = landscape ? [85.6, 54] : [54, 85.6];
    const resize = (settings: CardSideSettings) => ({ ...settings, widthMm, heightMm, ...layoutForPaper(settings.template, widthMm, heightMm, layoutFlags(settings)) });
    change({ ...latestDesign(), front: resize(latestDesign().front), back: resize(latestDesign().back) });
  };

  const upload = async (send: () => Promise<{ ok: true; data?: { url: string | null } } | { ok: false; error: string }>) => {
    setUploading(true);
    setError(null);
    try {
      const result = await send();
      if (result.ok) return result.data?.url ?? null;
      setError(result.error);
    } catch {
      setError("The image didn't upload. Try again.");
    } finally {
      setUploading(false);
    }
    return undefined;
  };
  const form = (file: File | null) => {
    const data = new FormData();
    data.set("organisationSlug", organisationSlug);
    if (planId) data.set("planId", planId);
    if (roleId) data.set("roleId", roleId);
    if (file) data.set("file", file);
    else data.set("remove", "1");
    return data;
  };
  const uploadWatermark = async (file: File | null) => {
    const url = await upload(() => uploadCardWatermark(form(file)));
    if (url === undefined) return;
    setBranding((value) => ({ ...value, watermarkUrl: url }));
    setEdited(true);
  };
  const uploadArtwork = async (file: File) => (await upload(() => uploadCardArtwork(form(file)))) ?? null;

  const selectedLayer = current.layers.find((layer) => layer.id === selected);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && (key === "y" || (key === "z" && event.shiftKey))) restore(history.redo(latestDesign()));
    else if (mod && key === "z") restore(history.undo(latestDesign()));
    else if (mod && key === "d" && selectedLayer) layers.duplicate(selectedLayer.id);
    else if ((key === "delete" || key === "backspace") && selectedLayer && (event.target as HTMLElement).closest("[data-card-frame], [data-layers-list]")) layers.remove(selectedLayer.id);
    else return;
    event.preventDefault();
  };

  const landscape = current.widthMm > current.heightMm;
  const visible = itemVisibility(current, branding);

  return (
    <div onKeyDown={onKeyDown} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <CardFontFaces fonts="all" />
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <SegmentedControl<CardSide> ariaLabel="Card side" value={side} onValueChange={(next) => { setSide(next); setSelected(next === "front" ? "name" : "footer"); }} options={[{ value: "front", label: "Front" }, { value: "back", label: "Back" }]} />
        <SegmentedControl<Sample> ariaLabel="Sample name" size="sm" value={sample} onValueChange={setSample} options={[{ value: "latin", label: "Latin" }, { value: "malayalam", label: "മലയാളം" }, { value: "devanagari", label: "हिन्दी" }]} />
        <div className="ml-auto flex items-center gap-2" aria-live="polite">
          <SaveStatusPill status={autosave.status} />
          {autosave.status === "error" ? <Button size="sm" variant="secondary" onClick={() => void autosave.save()}>Try again</Button> : null}
        </div>
      </header>
      <ApprovalBar state={approval} pending={approval.pending || edited} scope={{ organisationSlug, planId, roleId }} flush={autosave.save} />
      {autosave.error ? <div className="px-4 pt-3"><Callout tone="danger" role="alert">{autosave.error}</Callout></div> : null}

      <div className="flex min-h-0 flex-col xl:grid xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <aside aria-label="Card settings" className="order-2 flex flex-col gap-6 border-line p-4 sm:p-5 xl:order-none xl:max-h-[920px] xl:overflow-y-auto xl:border-r">
          <Section title="Design">
            <PresetPicker value={design.preset} onChange={(preset) => change(applyCardPreset(latestDesign(), preset, context))} />
            <p className="text-caption text-ink-muted">More ready-made designs, with their own colours, fonts and shapes:</p>
            <TemplateGallery context={context} holder={holder} branding={branding} onChoose={(id) => { change(applyCardTemplate(latestDesign(), id, context)); setSelected("name"); }} />
            <p className="text-caption text-ink-muted">Choosing a design replaces both sides. Undo brings the last one back.</p>
            <SegmentedControl<"landscape" | "portrait"> ariaLabel="Orientation" size="sm" value={landscape ? "landscape" : "portrait"} onValueChange={(next) => setOrientation(next === "landscape")} options={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]} className="self-start" />
            <p className="text-caption text-ink-muted">ID card size (CR80, {CR80.widthMm} × 54 mm).</p>
          </Section>
          {initialNumbering ? (
            <Section title="Card numbers">
              <NumberingSection value={numbering} role={Boolean(roleId)} unitLevels={unitLevels} onChange={(next) => { setNumbering(next); autosave.set({ numbering: next }); setEdited(true); }} />
            </Section>
          ) : null}
          {side === "back" ? (
            <Section title="Back">
              <SwitchLine label="Print a back" hint="Off: downloads and the wallet show the front only." checked={design.backEnabled} onCheckedChange={(backEnabled) => change({ ...latestDesign(), backEnabled })} />
            </Section>
          ) : null}
          <BackgroundSection value={current.background} uploading={uploading} onChange={(background) => update({ background })} onUpload={async (file) => { const url = await uploadArtwork(file); if (url) update({ background: { ...latestDesign()[side].background, imageUrl: url } }); }} />
          <SideSettings side={side} current={current} branding={branding} fields={fields} uploading={uploading} update={update} toggleItem={toggleItem} onWatermark={(file) => void uploadWatermark(file)} />
        </aside>

        <section aria-label="Card preview" className="order-1 flex min-h-[360px] min-w-0 flex-col bg-subtle xl:order-none">
          <DesignerToolbar
            full={current.layers.length >= MAX_LAYERS}
            uploading={uploading}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onAdd={(kind) => layers.add(kind)}
            onAddImage={async (file) => { const url = await uploadArtwork(file); if (url) layers.add("image", { url, aspect: await imageAspect(file) }); }}
            onUndo={() => restore(history.undo(latestDesign()))}
            onRedo={() => restore(history.redo(latestDesign()))}
          />
          <FitArea widthMm={current.widthMm} heightMm={current.heightMm}>
            {(pxPerMm) => <CardCanvas settings={current} holder={holder} branding={branding} pxPerMm={pxPerMm} interaction={{ selected, onSelect: setSelected, onBeginChange: () => history.checkpoint(latestDesign(), false), onMove: move, onLayerMove: layers.dragTo, onLayerMoveEnd: layers.endDrag, onLayerChange: (id, patch) => layers.change(id, patch, false), guides: layers.guides, showGrid: false }} />}
          </FitArea>
          <p className="border-t border-line bg-canvas px-4 py-2 text-caption text-ink-muted">
            {side === "back" && !design.backEnabled ? "The back is turned off, so cards print the front only." : "Select an item to edit it. Drag it or use the arrow keys (Shift for bigger steps); hold Alt while dragging a layer to place it freely. Sample details shown."}
          </p>
        </section>

        <aside aria-label="Selected item and layers" className="order-1 flex flex-col gap-6 border-line p-4 sm:p-5 xl:order-none xl:max-h-[920px] xl:overflow-y-auto xl:border-l">
          {selectedLayer ? (
            <LayerInspector layer={selectedLayer} card={current} orgAccent={orgAccentHex(branding.orgAccent)} uploading={uploading} unitLevels={unitLevels} onChange={(patch) => layers.change(selectedLayer.id, patch, "coalesce")} onReplaceImage={async (file) => { const url = await uploadArtwork(file); if (url) layers.change(selectedLayer.id, { url } as Partial<CardLayer>, true); }} />
          ) : (
            <Inspector settings={current} branding={branding} selected={isElement(selected) ? selected : "name"} onSelect={setSelected} update={update} />
          )}
          <LayersPanel order={current.order} layers={current.layers} visible={visible} selected={selected} onSelect={setSelected} onMove={layers.reorder} onLayerChange={(id, patch) => layers.change(id, patch, true)} onDuplicate={layers.duplicate} onDelete={layers.remove} />
        </aside>
      </div>
    </div>
  );
}

/** Width over height of a picture, for a new image layer of the same shape. */
async function imageAspect(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const aspect = bitmap.width / bitmap.height;
    bitmap.close();
    return aspect;
  } catch {
    return 1;
  }
}
