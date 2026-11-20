"use client";

import { useMemo, useState } from "react";
import { Callout } from "@/components/ui/display";
import { Field, SearchInput } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { CardSideSettings } from "@/lib/cards/design/elements";
import { imageElement, libraryContext, type LibraryItem } from "@/lib/cards/design/library/base";
import { fits, iconElement, ICONS_CATEGORY, LIBRARY, searchLibrary } from "@/lib/cards/design/library/catalog";
import { MAX_LAYERS, type CardLayer } from "@/lib/cards/design/layerTypes";
import { resolveCardPalette } from "@/lib/cards/palette";
import type { CardHolder } from "@/lib/cards/types";
import type { BrandKit } from "../editor/brandKit";
import { imageAspect } from "../editor/useArtworkUploads";
import { BrandLogos } from "./BrandLogos";
import { ElementThumb } from "./ElementThumb";
import { IconGrid } from "./IconGrid";

export type ElementsPanelProps = {
  side: CardSideSettings;
  full: boolean;
  holder: CardHolder;
  brandKit: BrandKit | null;
  /** Add the layers on top as one undo step (grouped when there are several). */
  onInsert: (layers: CardLayer[]) => void;
  /** Put `{placeholder}` into the selected text layer, or a new text layer. */
  onInsertText: (placeholder: string) => void;
  uploading: boolean;
  onUploadImage: (file: File) => Promise<string | null>;
  /** The organisation's level names, top first; left out, the Fields panel reads them from the sample member. */
  unitLevels?: readonly string[];
  /** For placing brand-kit logos (copied into the card artwork first). */
  organisationSlug?: string;
};

const CATEGORIES = [...LIBRARY.slice(0, 3).map(({ id, label }) => ({ id, label })), ICONS_CATEGORY, ...LIBRARY.slice(3).map(({ id, label }) => ({ id, label }))];
const TILE = "flex min-h-11 flex-col items-center gap-1 rounded-lg border border-line bg-panel p-1.5 text-center text-caption text-ink transition-colors duration-(--sw-dur-fast) hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

/**
 * The element library: shapes, bands and borders, badges, icons, dividers, the card's codes, photo
 * frames, text styles, gradients and patterns, in the brand kit's colours. Every tile is a button
 * (click, Enter or Space adds it on top of the card, grouped when it has several layers); a search
 * looks across every category. Pictures upload into the design and keep their proportions.
 */
export function ElementsPanel({ side, full, holder, brandKit, onInsert, uploading, onUploadImage, organisationSlug }: ElementsPanelProps) {
  const [category, setCategory] = useState<string>(LIBRARY[0]!.id);
  const [query, setQuery] = useState("");
  const brandColours = brandKit?.colours;
  const { widthMm, heightMm, colorMode, backgroundColor, accentColor, textColor } = side;
  const { background: customBackground, accent: customAccent, text: customText } = side.customColours;
  // Thumbnails depend on the card's size and colours only, so editing layers doesn't redraw them.
  const preview = useMemo(() => {
    const look = { colorMode, backgroundColor, accentColor, textColor, customColours: { background: customBackground, accent: customAccent, text: customText } };
    return { ctx: libraryContext({ widthMm, heightMm, layers: [], ...look }, brandColours), background: resolveCardPalette(look, null).background };
  }, [widthMm, heightMm, colorMode, backgroundColor, accentColor, textColor, customBackground, customAccent, customText, brandColours]);
  const searching = query.trim() !== "";
  const items = searching ? searchLibrary(query) : LIBRARY.find((entry) => entry.id === category)?.items ?? [];
  const showIcons = searching || category === ICONS_CATEGORY.id;
  const context = () => libraryContext(side, brandColours);
  const insert = (layers: CardLayer[]) => {
    if (fits(side.layers.length, layers.length)) onInsert(layers);
  };

  const upload = async (file: File) => {
    const url = await onUploadImage(file);
    if (url) insert(imageElement(context(), url, await imageAspect(file)));
  };

  return (
    <div className="flex flex-col gap-4">
      {full ? <Callout tone="info">This side holds the most layers it can ({MAX_LAYERS}). Delete a layer to add another.</Callout> : null}
      <Field label="Upload an image" helperText="PNG, JPEG or WebP, up to 5 MB. It keeps its proportions.">
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading || full} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-control file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
      </Field>
      {organisationSlug ? <BrandLogos organisationSlug={organisationSlug} logos={brandKit?.logos ?? []} disabled={full} onPlace={(url, aspect) => insert(imageElement(context(), url, aspect))} /> : null}
      <SearchInput aria-label="Find an element" placeholder="Find an element" value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} />
      {searching ? null : (
        <div role="group" aria-label="Element categories" className="flex flex-wrap gap-1">
          {CATEGORIES.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={entry.id === category} onClick={() => setCategory(entry.id)} className={cn("min-h-11 rounded-control border px-3 text-[14px] text-ink hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--sw-ui-focus))]", entry.id === category ? "border-primary bg-subtle font-semibold shadow-[inset_0_0_0_1px_var(--color-primary)]" : "border-line bg-panel")}>
              {entry.label}
            </button>
          ))}
        </div>
      )}
      {items.length ? (
        <div role="group" aria-label={searching ? "Matching elements" : CATEGORIES.find((entry) => entry.id === category)?.label} className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
          {items.map((item) => <Tile key={item.id} item={item} preview={preview} side={side} holder={holder} disabled={full} onInsert={() => insert(item.make(context()))} />)}
        </div>
      ) : null}
      {showIcons ? (
        <div className="flex flex-col gap-1.5">
          {searching ? <p className="text-caption font-semibold text-ink-muted">Icons</p> : null}
          <IconGrid query={query} disabled={full} onChoose={(icon) => insert(iconElement(context(), icon.id, icon.label))} />
        </div>
      ) : null}
      {searching && !items.length ? <p className="text-caption text-ink-muted">Shapes, bands, badges and the rest have nothing by that name.</p> : null}
    </div>
  );
}

function Tile({ item, preview, side, holder, disabled, onInsert }: { item: LibraryItem; preview: { ctx: ReturnType<typeof libraryContext>; background: string }; side: CardSideSettings; holder: CardHolder; disabled: boolean; onInsert: () => void }) {
  const layers = useMemo(() => item.make(preview.ctx), [item, preview]);
  const tooMany = !fits(side.layers.length, layers.length);
  return (
    <button type="button" disabled={disabled || tooMany} onClick={onInsert} title={tooMany && !disabled ? `${item.label}: needs ${layers.length} layers, more than this side has room for` : item.label} className={TILE}>
      <ElementThumb layers={layers} card={{ widthMm: side.widthMm, heightMm: side.heightMm, background: preview.background }} holder={holder} mono={side.colorMode === "mono"} frame={item.frame} />
      <span className="line-clamp-2">{item.label}</span>
    </button>
  );
}
