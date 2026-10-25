"use client";

import { useEffect, useRef, useState } from "react";
import { saveCardDesign, uploadCardWatermark } from "@/app/actions/card-design";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { CR80, elementBoxHeightMm, layoutFlags, type CardElement, type CardLayoutFlags, type CardSideSettings } from "@/lib/cards/design/elements";
import { isDefaultLayout, layoutForPaper } from "@/lib/cards/design/geometry";
import { normalizeCardSide, TEXT_LIMITS } from "@/lib/cards/design/normalize";
import { applyCardPreset, type CardDesign, type CardSide } from "@/lib/cards/design/presets";
import { formatCardNumberFrom, normalizeNumberFormat, numberFormatError } from "@/lib/cards/numbering";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import { CardCanvas } from "../CardCanvas";
import { CardFontFaces } from "../cardFonts";
import { SAFE_MARGIN_MM } from "../canvasInteraction";
import { FitArea, SaveStatusPill, Section, SwitchLine, type SaveStatus } from "./controls";
import { Inspector } from "./Inspector";
import { NumberingSection, type Numbering } from "./NumberingSection";
import { PresetPicker } from "./PresetPicker";
import { SideSettings, type DesignerField } from "./SideSettings";

const SAVE_DELAY_MS = 900;
const SAMPLES = { latin: "Shaan Shoukath", malayalam: "ഷാൻ ഷൗക്കത്ത്", devanagari: "शान शौकत" } as const;
type Sample = keyof typeof SAMPLES;

function sampleHolder(name: string, planName: string, roleName: string, idNumber: string, fields: DesignerField[]): CardHolder {
  return {
    memberId: "sample",
    verifyToken: "sample",
    verifyUrl: "https://example.invalid/verify/sample-card",
    displayName: name,
    role: roleName || "Systems Engineer",
    planName: planName || "Annual member",
    details: fields.map((field) => ({ key: field.key, label: field.label, value: /blood/i.test(field.label) ? "O+" : /date|birth/i.test(field.label) ? "14 Feb 1998" : "Sample answer" })),
    photoUrl: null,
    idNumber,
    validUntil: "31 Mar 2027",
  };
}

/**
 * Front and back designer for member cards. Each side is edited on a to-scale canvas with an
 * inspector for the selected item, and the whole design autosaves to the organisation default, one
 * plan (`planId`) or one member role (`roleId`).
 */
export function CardDesigner({ organisationSlug, organisationName, planId, planName, roleId, roleName, initialDesign, branding: initialBranding, fields, numbering: initialNumbering }: {
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
}) {
  const [design, setDesign] = useState(initialDesign);
  const [side, setSide] = useState<CardSide>("front");
  const [selected, setSelected] = useState<CardElement>("name");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState(initialBranding);
  const [uploading, setUploading] = useState(false);
  const [sample, setSample] = useState<Sample>("latin");
  const [numbering, setNumbering] = useState<Numbering>(initialNumbering ?? { prefix: "", format: "" });
  const latest = useRef({ design, numbering });
  const timer = useRef<number | null>(null);
  const saving = useRef(false);
  const dirty = useRef(false);
  const context = { organisationName, planName };

  const save = async (): Promise<void> => {
    if (saving.current) {
      dirty.current = true;
      return;
    }
    saving.current = true;
    dirty.current = false;
    setStatus("saving");
    try {
      const { design: next, numbering: nextNumbering } = latest.current;
      const result = await saveCardDesign({
        organisationSlug, planId, roleId, design: next as unknown as Record<string, unknown>,
        ...(initialNumbering && /^[A-Z0-9]{2,6}$/.test(nextNumbering.prefix) ? { numberPrefix: nextNumbering.prefix } : {}),
        ...(initialNumbering && !numberFormatError(nextNumbering.format) ? { numberFormat: nextNumbering.format } : {}),
      });
      setStatus(result.ok ? (dirty.current ? "pending" : "saved") : "error");
      setError(result.ok ? null : result.error);
    } catch {
      setStatus("error");
      setError("The design couldn't be saved. Check your connection.");
    } finally {
      saving.current = false;
      if (dirty.current) void save();
    }
  };

  // Leaving inside the debounce window saves the pending edit instead of dropping it. `save` reads only refs and props.
  useEffect(() => () => {
    if (!timer.current) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on unmount
  }, []);

  const schedule = () => {
    setStatus("pending");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void save();
    }, SAVE_DELAY_MS);
  };

  const commit = (next: CardDesign) => {
    latest.current = { ...latest.current, design: next };
    setDesign(next);
    schedule();
  };

  const current = design[side];
  const sampleNumber = initialNumbering && !numberFormatError(numbering.format)
    ? formatCardNumberFrom(normalizeNumberFormat(numbering.format), { prefix: numbering.prefix || "M", seq: 42, memberNumber: 7, year: new Date().getFullYear() })
    : "M-0042";
  const holder = sampleHolder(SAMPLES[sample], planName, roleName, sampleNumber, fields);

  const update = (patch: Partial<CardSideSettings>) => {
    const base = latest.current.design[side];
    const next = normalizeCardSide({ ...base, ...patch }, context);
    // Text stays exactly as typed (including empty) while editing.
    for (const [key, max] of TEXT_LIMITS) next[key] = (patch[key] ?? base[key]).slice(0, max);
    commit({ ...latest.current.design, [side]: next });
  };

  const move = (element: CardElement, xMm: number, yMm: number) => {
    const size = current.elementSizes[element];
    const height = elementBoxHeightMm(element, current.elementSizes);
    const snap = (value: number) => Math.round(value / current.gridSizeMm) * current.gridSizeMm;
    const next = {
      xMm: Math.min(Math.max(0, current.widthMm - size - SAFE_MARGIN_MM), Math.max(0, snap(xMm))),
      yMm: Math.min(Math.max(0, current.heightMm - height - SAFE_MARGIN_MM), Math.max(0, snap(yMm))),
    };
    const at = current.elementPositions[element];
    if (at.xMm !== next.xMm || at.yMm !== next.yMm) update({ elementPositions: { ...current.elementPositions, [element]: next } });
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
    commit({ ...latest.current.design, front: resize(latest.current.design.front), back: resize(latest.current.design.back) });
  };

  const uploadWatermark = async (file: File | null) => {
    setUploading(true);
    setError(null);
    const data = new FormData();
    data.set("organisationSlug", organisationSlug);
    if (planId) data.set("planId", planId);
    if (roleId) data.set("roleId", roleId);
    if (file) data.set("file", file);
    else data.set("remove", "1");
    try {
      const result = await uploadCardWatermark(data);
      if (result.ok) setBranding((value) => ({ ...value, watermarkUrl: result.data?.url ?? null }));
      else setError(result.error);
    } catch {
      setError("The image didn't upload. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const landscape = current.widthMm > current.heightMm;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <CardFontFaces />
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <SegmentedControl<CardSide> ariaLabel="Card side" value={side} onValueChange={(next) => { setSide(next); setSelected(next === "front" ? "name" : "footer"); }} options={[{ value: "front", label: "Front" }, { value: "back", label: "Back" }]} />
        <SegmentedControl<Sample> ariaLabel="Sample name" size="sm" value={sample} onValueChange={setSample} options={[{ value: "latin", label: "Latin" }, { value: "malayalam", label: "മലയാളം" }, { value: "devanagari", label: "हिन्दी" }]} />
        <div className="ml-auto flex items-center gap-2" aria-live="polite">
          <SaveStatusPill status={status} />
          {status === "error" ? <Button size="sm" variant="secondary" onClick={() => void save()}>Try again</Button> : null}
        </div>
      </header>
      {error ? <div className="px-4 pt-3"><Callout tone="danger" role="alert">{error}</Callout></div> : null}

      <div className="flex min-h-0 flex-col xl:grid xl:grid-cols-[300px_minmax(0,1fr)_280px]">
        <aside aria-label="Card settings" className="order-2 flex flex-col gap-6 border-line p-4 sm:p-5 xl:order-none xl:max-h-[880px] xl:overflow-y-auto xl:border-r">
          <Section title="Design">
            <PresetPicker value={design.preset} onChange={(preset) => commit(applyCardPreset(latest.current.design, preset, context))} />
            <p className="text-caption text-ink-muted">Choosing a design resets both sides&apos; layout and colours.</p>
            <SegmentedControl<"landscape" | "portrait"> ariaLabel="Orientation" size="sm" value={landscape ? "landscape" : "portrait"} onValueChange={(next) => setOrientation(next === "landscape")} options={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]} className="self-start" />
            <p className="text-caption text-ink-muted">ID card size (CR80, {CR80.widthMm} × 54 mm).</p>
          </Section>
          {initialNumbering ? (
            <Section title="Card numbers">
              <NumberingSection value={numbering} role={Boolean(roleId)} onChange={(next) => { setNumbering(next); latest.current = { ...latest.current, numbering: next }; schedule(); }} />
            </Section>
          ) : null}
          {side === "back" ? (
            <Section title="Back">
              <SwitchLine label="Print a back" hint="Off: downloads and the wallet show the front only." checked={design.backEnabled} onCheckedChange={(backEnabled) => commit({ ...latest.current.design, backEnabled })} />
            </Section>
          ) : null}
          <SideSettings side={side} current={current} branding={branding} fields={fields} uploading={uploading} update={update} toggleItem={toggleItem} onWatermark={(file) => void uploadWatermark(file)} />
        </aside>

        <section aria-label="Card preview" className="order-1 flex min-h-[360px] min-w-0 flex-col bg-subtle xl:order-none">
          <FitArea widthMm={current.widthMm} heightMm={current.heightMm}>
            {(pxPerMm) => <CardCanvas settings={current} holder={holder} branding={branding} pxPerMm={pxPerMm} interaction={{ selected, onSelect: setSelected, onBeginChange: () => undefined, onMove: move, showGrid: false }} />}
          </FitArea>
          <p className="border-t border-line bg-canvas px-4 py-2 text-caption text-ink-muted">
            {side === "back" && !design.backEnabled ? "The back is turned off, so cards print the front only." : "Select an item to edit it. Drag it, or use the arrow keys (Shift for bigger steps). Sample details shown."}
          </p>
        </section>

        <aside aria-label="Selected item" className="order-1 border-line p-4 sm:p-5 xl:order-none xl:max-h-[880px] xl:overflow-y-auto xl:border-l">
          <Inspector settings={current} branding={branding} selected={selected} onSelect={setSelected} update={update} />
        </aside>
      </div>
    </div>
  );
}
