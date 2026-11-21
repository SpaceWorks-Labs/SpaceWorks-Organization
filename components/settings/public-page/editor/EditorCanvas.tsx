"use client";

import { useCallback, useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { plansSectionId } from "@/lib/publicPage/live";
import { leadingHero, type PageDocument, type PageSection } from "@/lib/publicPage/sections";
import { LeadingHero, PageHero } from "@/components/public/sections/PageTop";
import type { Live } from "@/components/public/sections/SectionBody";
import type { ActionContext } from "@/components/public/sections/shared";
import { Button, IconButton } from "@/components/ui/button";
import { accentStyle } from "@/lib/theme/accent";
import { cn } from "@/lib/cn";
import previewStyles from "../preview.module.css";
import { getIn } from "./documentOps";
import { inlineFields, pickInlineField, type InlineField } from "./inlineFields";
import { InlineTextEditor, type InlineEditing } from "./InlineTextEditor";
import type { PreviewDevice, PreviewMode } from "./previewChoice";
import { SectionFrame, SectionView, type FrameAction } from "./SectionFrame";
import styles from "./editor.module.css";

/** The page's own top (no leading hero): its tagline can be edited in place; the rest is in page settings. */
const PAGE_FIELDS = (document: PageDocument): InlineField[] => [{ path: "tagline", value: document.tagline, multiline: false, max: 160 }];
export const PAGE_TOP = "page";

type Props = {
  document: PageDocument;
  live: Live;
  mode: PreviewMode;
  device: PreviewDevice;
  accent: string;
  selectedId: string | null;
  failed: ReadonlySet<number>;
  canEdit: boolean;
  onSelect: (id: string, openSettings: boolean) => void;
  onAction: (id: string, action: FrameAction) => void;
  onMove: (from: number, to: number) => void;
  /** A field edited in place: `sectionId` is a section's id or PAGE_TOP. Typing coalesces into one undo step. */
  onFieldChange: (sectionId: string, path: string, value: string) => void;
  onAddBlock: (afterId: string | null) => void;
};

/**
 * The editing canvas: the page as visitors see it (the public renderers, in the page's accent, in light or dark and at
 * desktop, tablet or phone width), each section in a frame to select, edit in place, drag and act on.
 */
export function EditorCanvas({ document, live, mode, device, accent, selectedId, failed, canEdit, onSelect, onAction, onMove, onFieldChange, onAddBlock }: Props) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState<(InlineEditing & { root: HTMLElement | null }) | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const hero = leadingHero(document);
  const context: ActionContext = useMemo(() => ({
    orgSlug: live.org.slug,
    plans: live.plans.map((plan) => ({ slug: plan.slug, joinMode: plan.joinMode })),
    takingMembers: live.takingMembers,
    plansSectionId: plansSectionId(document),
    areaCode: null,
  }), [live.org.slug, live.plans, live.takingMembers, document]);

  const startEditing = useCallback((sectionId: string, fields: InlineField[], event: MouseEvent<HTMLElement> | null, root: HTMLElement | null) => {
    if (!canEdit || !event || !root) return;
    const found = pickInlineField(root, event.clientX, event.clientY, fields);
    if (found) setEditing({ sectionId, field: found.field, element: found.element, original: found.field.value, root });
  }, [canEdit]);

  const select = useCallback((id: string, event: MouseEvent<HTMLElement> | null, root: HTMLElement | null) => {
    onSelect(id, false);
    const section = document.sections.find((one) => one.id === id);
    if (section) startEditing(id, inlineFields(section), event, root);
  }, [document.sections, onSelect, startEditing]);

  const focusSibling = useCallback((index: number, by: -1 | 1) => {
    const frames = [...(host?.querySelectorAll<HTMLElement>("[data-frame-index]") ?? [])];
    const at = frames.findIndex((frame) => Number(frame.dataset.frameIndex) === index);
    frames[at + by]?.focus();
  }, [host]);

  const dragStart = useCallback((index: number, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    const frame = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-frame-index]");
    if (frame) event.dataTransfer.setDragImage(frame, 24, 24);
    setDrag({ from: index, to: index });
  }, []);
  const dragOver = useCallback((index: number, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const box = event.currentTarget.getBoundingClientRect();
    const to = event.clientY < box.top + box.height / 2 ? index : index + 1;
    setDrag((current) => (current && current.to !== to ? { ...current, to } : current));
  }, []);
  const drop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDrag((current) => {
      if (current) onMove(current.from, current.to > current.from ? current.to - 1 : current.to);
      return null;
    });
  }, [onMove]);
  const dragEnd = useCallback(() => setDrag(null), []);
  const dropEdge = (index: number) => {
    if (!drag || drag.to === drag.from || drag.to === drag.from + 1) return null;
    if (drag.to === index) return "before" as const;
    return drag.to === document.sections.length && index === document.sections.length - 1 ? "after" as const : null;
  };

  const count = document.sections.length;
  const frame = (section: PageSection, children: ReactNode) => {
    const index = document.sections.indexOf(section);
    return (
      <div key={section.id} className="flex flex-col gap-6">
        <SectionFrame
          section={section}
          index={index}
          count={count}
          selected={selectedId === section.id}
          failed={failed.has(index)}
          canDuplicate={canEdit && section.type !== "hero" && count < 30}
          canMove={canEdit}
          dropEdge={dropEdge(index)}
          onSelect={select}
          onAction={onAction}
          onFocusSibling={focusSibling}
          onDragStart={dragStart}
          onDragOver={dragOver}
          onDrop={drop}
          onDragEnd={dragEnd}
        >
          {children}
        </SectionFrame>
        {selectedId === section.id && canEdit ? (
          <Button type="button" size="sm" variant="ghost" className="self-center border border-dashed border-line-strong" onClick={() => onAddBlock(section.id)}>
            <Plus aria-hidden className="size-4" />Add a block below
          </Button>
        ) : null}
      </div>
    );
  };

  const editedValue = editing ? String(getIn(editing.sectionId === PAGE_TOP ? document : document.sections.find((one) => one.id === editing.sectionId), editing.field.path) ?? "") : "";
  const pageTopSelected = selectedId === PAGE_TOP;

  return (
    <div
      ref={setHost}
      data-mode={mode}
      style={accentStyle(accent)}
      className={cn(
        "sw-accent-scope sw-display-headings @container relative min-h-full",
        previewStyles.frame,
        styles.page,
        mode === "dark" ? "dark sw-preview-dark" : "sw-preview-light",
        device === "desktop" ? "w-full" : cn(device === "tablet" ? styles.tablet : styles.phone, "border-x border-line"),
      )}
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-20 px-4 pb-24 pt-24 @xl:px-8 @4xl:gap-28">
        {hero ? frame(hero, <LeadingHero section={hero} document={document} org={live.org} context={context} />) : (
          <div
            role="group"
            aria-roledescription="page top"
            aria-label="Page top: your logo, name, tagline and cover"
            tabIndex={0}
            onClick={(event) => {
              onSelect(PAGE_TOP, false);
              const root = event.currentTarget.querySelector<HTMLElement>("[data-top-content]");
              if (canEdit && root) {
                const found = pickInlineField(root, event.clientX, event.clientY, PAGE_FIELDS(document));
                if (found) setEditing({ sectionId: PAGE_TOP, field: found.field, element: found.element, original: found.field.value, root });
              }
            }}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect(PAGE_TOP, true);
              }
            }}
            className={cn("group/frame relative rounded-xl outline-offset-[12px] focus-visible:outline-2 focus-visible:outline-primary", pageTopSelected ? "outline-2 outline-solid outline-primary" : "hover:outline-2 hover:outline-dashed hover:outline-line-strong")}
          >
            <div data-top-content inert><PageHero document={document} org={live.org} /></div>
            <div className={cn("absolute -top-16 right-0 flex items-center gap-2 rounded-control border border-line bg-panel py-1 pl-3 pr-1.5 shadow-float transition-opacity duration-(--sw-dur-fast) ease-sw", pageTopSelected ? "opacity-100" : "pointer-events-none opacity-0 group-hover/frame:pointer-events-auto group-hover/frame:opacity-100 group-focus-within/frame:pointer-events-auto group-focus-within/frame:opacity-100")}>
              <span className="text-caption font-semibold text-ink-muted">Page top</span>
              <IconButton size="sm" label="Page settings" onClick={(event) => { event.stopPropagation(); onSelect(PAGE_TOP, true); }}><SlidersHorizontal /></IconButton>
            </div>
          </div>
        )}
        {document.sections.filter((section) => section !== hero).map((section) => frame(section, <SectionView section={section} live={live} context={context} />))}
        {count === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="text-body-l text-ink">Your page has no sections yet.</p>
            <p className="max-w-[460px] text-body-ui text-ink-muted">Add a block, or start from a template in the toolbar. Visitors see the plain page until you publish.</p>
            {canEdit ? <Button type="button" variant="secondary" onClick={() => onAddBlock(null)}><Plus aria-hidden className="size-4" />Add a block</Button> : null}
          </div>
        ) : null}
      </div>
      {editing && host ? (
        <InlineTextEditor
          key={`${editing.sectionId}:${editing.field.path}`}
          editing={editing}
          value={editedValue}
          host={host}
          root={editing.root}
          onChange={(value) => onFieldChange(editing.sectionId, editing.field.path, value)}
          onDone={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
