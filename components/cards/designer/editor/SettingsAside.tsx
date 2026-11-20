"use client";

import { SegmentedControl } from "@/components/ui/choice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CR80, type CardLayoutFlags, type CardElement, type CardSideSettings } from "@/lib/cards/design/elements";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import type { CardDesign, CardPreset, CardSide } from "@/lib/cards/design/presets";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import { BackgroundSection } from "../BackgroundSection";
import { Section, SwitchLine } from "../controls";
import { ElementsPanel } from "../elements/ElementsPanel";
import { FieldsPanel } from "../elements/FieldsPanel";
import { NumberingSection, type Numbering } from "../NumberingSection";
import { PresetPicker } from "../PresetPicker";
import { SideSettings, type DesignerField } from "../SideSettings";
import { TemplateGallery } from "../TemplateGallery";
import type { BrandKit } from "./brandKit";

type TemplateContext = Parameters<typeof TemplateGallery>[0]["context"];

/**
 * The designer's left pane, in three tabs: Design (ready-made designs, orientation, numbering,
 * background and the side's built-in items), Elements (shapes, icons, codes, photos) and Fields
 * (member details as text).
 */
export function SettingsAside(props: {
  design: CardDesign;
  side: CardSide;
  current: CardSideSettings;
  branding: CardBranding;
  fields: DesignerField[];
  holder: CardHolder;
  context: TemplateContext;
  uploading: boolean;
  numbering: { value: Numbering; role: boolean; unitLevels?: string[]; onChange: (next: Numbering) => void } | null;
  brandKit: BrandKit | null;
  /** Every colour the design uses, for the colour pickers. */
  documentColours: string[];
  organisationSlug: string;
  unitLevels?: string[];
  full: boolean;
  onPreset: (preset: CardPreset) => void;
  onTemplate: Parameters<typeof TemplateGallery>[0]["onChoose"];
  /** An organisation template chosen from "Your templates". */
  onChooseDesign: (design: CardDesign) => void;
  onOrientation: (landscape: boolean) => void;
  onBackEnabled: (on: boolean) => void;
  update: (patch: Partial<CardSideSettings>) => void;
  toggleItem: (flag: keyof CardLayoutFlags, on: boolean, element: CardElement) => void;
  onWatermark: (file: File | null) => void;
  onUploadBackground: (file: File) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  onInsert: (layers: CardLayer[]) => void;
  onInsertText: (placeholder: string) => void;
}) {
  const { design, side, current, branding, holder, context, uploading } = props;
  const landscape = current.widthMm > current.heightMm;
  const library = { side: current, full: props.full, holder, brandKit: props.brandKit, onInsert: props.onInsert, onInsertText: props.onInsertText, uploading, onUploadImage: props.onUploadImage, unitLevels: props.unitLevels, organisationSlug: props.organisationSlug };
  return (
    <aside aria-label="Card settings" className="flex flex-col border-line p-4 sm:p-5 xl:col-start-1 xl:row-start-1 xl:max-h-[920px] xl:overflow-y-auto xl:border-r">
      <Tabs defaultValue="design">
        <TabsList aria-label="Designer panels">
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="elements">Elements</TabsTrigger>
          <TabsTrigger value="fields">Fields</TabsTrigger>
        </TabsList>
        <TabsContent value="design" className="flex flex-col gap-6">
          <Section title="Design">
            <PresetPicker value={design.preset} onChange={props.onPreset} />
            <p className="text-caption text-ink-muted">More ready-made designs, with their own colours, fonts and shapes:</p>
            <TemplateGallery context={context} holder={holder} branding={branding} onChoose={props.onTemplate} organisationSlug={props.organisationSlug} onChooseDesign={props.onChooseDesign} />
            <p className="text-caption text-ink-muted">Choosing a design replaces both sides. Undo brings the last one back.</p>
            <SegmentedControl<"landscape" | "portrait"> ariaLabel="Orientation" size="sm" value={landscape ? "landscape" : "portrait"} onValueChange={(next) => props.onOrientation(next === "landscape")} options={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]} className="self-start" />
            <p className="text-caption text-ink-muted">ID card size (CR80, {CR80.widthMm} × 54 mm). Turning the card re-lays your layers to fit.</p>
          </Section>
          {props.numbering ? (
            <Section title="Card numbers">
              <NumberingSection value={props.numbering.value} role={props.numbering.role} unitLevels={props.numbering.unitLevels} onChange={props.numbering.onChange} />
            </Section>
          ) : null}
          {side === "back" ? (
            <Section title="Back">
              <SwitchLine label="Print a back" hint="Off: downloads and the wallet show the front only." checked={design.backEnabled} onCheckedChange={props.onBackEnabled} />
            </Section>
          ) : null}
          <BackgroundSection value={current.background} uploading={uploading} onChange={(background) => props.update({ background })} onUpload={props.onUploadBackground} />
          <SideSettings side={side} current={current} branding={branding} fields={props.fields} uploading={uploading} update={props.update} toggleItem={props.toggleItem} onWatermark={props.onWatermark} brandColours={props.brandKit?.colours} documentColours={props.documentColours} />
        </TabsContent>
        <TabsContent value="elements" className="flex flex-col gap-6">
          <ElementsPanel {...library} />
        </TabsContent>
        <TabsContent value="fields" className="flex flex-col gap-6">
          <FieldsPanel {...library} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
