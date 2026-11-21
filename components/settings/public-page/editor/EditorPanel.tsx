"use client";

import { ArrowLeft } from "lucide-react";
import { leadingHero, SECTION_LABELS, type PageDocument, type PageSection, type SectionType } from "@/lib/publicPage/sections";
import { PageSections } from "@/components/public/PageSections";
import type { Live } from "@/components/public/sections/SectionBody";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/lib/theme/accent";
import { cn } from "@/lib/cn";
import previewStyles from "../preview.module.css";
import { PageDetailsFields } from "../PageDetailsFields";
import { sectionName } from "../sectionContent";
import type { FieldContext } from "../fields/shared";
import { BlockLibrary } from "./BlockLibrary";
import { errorsForSection } from "./documentOps";
import type { PanelMode } from "./EditorToolbar";
import { PageOutline } from "./PageOutline";
import type { PreviewMode } from "./previewChoice";
import { SectionSettings } from "./SectionSettings";

/** A whole document as visitors would see it, inert, in a chosen theme (the version history's preview). */
export function PreviewFrame({ document, live, mode, accent }: { document: PageDocument; live: Live; mode: PreviewMode; accent: string }) {
  return (
    <div
      data-mode={mode}
      inert
      style={accentStyle(document.accentColor ?? accent)}
      className={cn("sw-accent-scope sw-display-headings @container p-5 sm:p-8", previewStyles.frame, mode === "dark" ? "dark sw-preview-dark" : "sw-preview-light")}
    >
      <PageSections document={document} {...live} />
    </div>
  );
}

type Props = Omit<FieldContext, "error"> & {
  panel: PanelMode;
  document: PageDocument;
  section: PageSection | null;
  errors: Record<string, string[]>;
  failed: ReadonlySet<number>;
  fallbackAccent: string;
  onPanel: (panel: PanelMode) => void;
  onDocument: (next: Partial<PageDocument>, coalesce?: boolean) => void;
  onSection: (next: PageSection, coalesce?: boolean) => void;
  onOpen: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onInsert: (type: SectionType) => void;
};

/** The side panel: the selected section's settings, page settings, the block library or the list of sections. */
export function EditorPanel({ panel, document, section, errors, failed, fallbackAccent, onPanel, onDocument, onSection, onOpen, onMove, onInsert, ...context }: Props) {
  const index = section ? document.sections.indexOf(section) : -1;
  const title = panel === "library" ? "Add block" : panel === "page" ? "Page settings" : panel === "settings" && section ? sectionName(section) : "Sections";
  const subtitle = panel === "settings" && section ? `${SECTION_LABELS[section.type].label} · ${index + 1} of ${document.sections.length}` : null;
  const placement = section && index >= 0 ? `New blocks go after “${sectionName(section)}”.` : "New blocks go at the end of the page. Select a section to add after it.";

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      {panel !== "outline" ? (
        <Button type="button" size="sm" variant="ghost" className="-ml-2 w-fit" onClick={() => onPanel("outline")}><ArrowLeft aria-hidden className="size-4" />All sections</Button>
      ) : null}
      <div className="flex flex-col gap-0.5">
        <h2 id="editor-panel-title" className="text-h4 break-words text-ink">{title}</h2>
        {subtitle ? <p className="text-caption text-ink-muted">{subtitle}</p> : null}
      </div>
      {panel === "library" ? <BlockLibrary hasHero={Boolean(document.sections.some((one) => one.type === "hero"))} count={document.sections.length} placement={placement} onInsert={onInsert} /> : null}
      {panel === "page" ? (
        <div className="flex flex-col gap-4">
          {leadingHero(document) ? <p className="text-caption text-ink-muted">Your page starts with a hero, so the cover shows only when the hero has no photo of its own.</p> : null}
          <PageDetailsFields slug={context.slug} value={document} fallbackAccent={fallbackAccent} disabled={context.disabled} errors={errors} onChange={(patch) => onDocument(patch, "tagline" in patch)} />
        </div>
      ) : null}
      {panel === "settings" && section ? <SectionSettings {...context} key={section.id} section={section} errors={errorsForSection(errors, index)} onChange={onSection} /> : null}
      {panel === "settings" && !section ? <p className="text-body-ui text-ink-muted">Select a section on the page to change it.</p> : null}
      {panel === "outline" ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-ui text-ink-muted">Top to bottom, as visitors see them. Open one to change it, or move it with the arrows. On the page, click any section or its text.</p>
          <PageOutline sections={document.sections} selectedId={section?.id ?? null} failed={failed} disabled={context.disabled} onOpen={onOpen} onMove={onMove} />
        </div>
      ) : null}
    </div>
  );
}
