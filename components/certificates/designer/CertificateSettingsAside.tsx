"use client";

import type { ComponentProps } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Section } from "@/components/cards/designer/controls";
import { ElementsPanel } from "@/components/cards/designer/elements/ElementsPanel";
import type { BrandKit } from "@/components/cards/designer/editor/brandKit";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import type { CardBranding, CardHolder } from "@/lib/cards/types";
import type { CertificateTextValues } from "@/lib/certificates/placeholders";
import { DesignDetails } from "./DesignDetails";
import { LayoutPicker } from "./LayoutPicker";
import { PageLook } from "./PageLook";
import { PlaceholderPanel } from "./PlaceholderPanel";

/**
 * The certificate designer's left pane, in three tabs: Design (the design's details and page, ready-made layouts,
 * page colour and background), Elements (the card element library: shapes, borders, badges, icons, the QR code,
 * barcode and photo frames, pictures) and Fields (the words filled in for each member).
 */
export function CertificateSettingsAside(props: {
  current: CardSideSettings;
  branding: CardBranding;
  sample: { holder: CardHolder; values: CertificateTextValues };
  unitLevels: readonly string[];
  uploading: boolean;
  full: boolean;
  brandKit: BrandKit | null;
  documentColours: string[];
  details: ComponentProps<typeof DesignDetails>;
  layouts: Omit<ComponentProps<typeof LayoutPicker>, "sample" | "branding" | "current">;
  update: (patch: Partial<CardSideSettings>) => void;
  onUploadBackground: (file: File) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  onInsert: (layers: CardLayer[]) => void;
  onInsertText: (key: string) => void;
}) {
  const { current, branding, sample, uploading } = props;
  return (
    <aside aria-label="Certificate settings" className="flex flex-col border-line p-4 sm:p-5 xl:col-start-1 xl:row-start-1 xl:max-h-[920px] xl:overflow-y-auto xl:border-r">
      <Tabs defaultValue="design">
        <TabsList aria-label="Designer panels">
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="elements">Elements</TabsTrigger>
          <TabsTrigger value="fields">Fields</TabsTrigger>
        </TabsList>
        <TabsContent value="design" className="flex flex-col gap-6">
          <Section title="Details">
            <DesignDetails {...props.details} />
          </Section>
          <Section title="Layouts">
            <LayoutPicker {...props.layouts} current={current} sample={sample} branding={branding} />
            <p className="text-caption text-ink-muted">A layout replaces every layer on the page. Undo brings the last one back.</p>
          </Section>
          <PageLook current={current} branding={branding} uploading={uploading} brandColours={props.brandKit?.colours} documentColours={props.documentColours} update={props.update} onUploadBackground={props.onUploadBackground} />
        </TabsContent>
        <TabsContent value="elements" className="flex flex-col gap-6">
          <ElementsPanel side={current} full={props.full} holder={sample.holder} brandKit={props.brandKit} uploading={uploading} onInsert={props.onInsert} onInsertText={props.onInsertText} onUploadImage={props.onUploadImage} unitLevels={props.unitLevels} />
        </TabsContent>
        <TabsContent value="fields" className="flex flex-col gap-6">
          <PlaceholderPanel unitLevels={props.unitLevels} sample={sample} full={props.full} onInsertText={props.onInsertText} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
