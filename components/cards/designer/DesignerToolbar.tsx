"use client";

import { useRef } from "react";
import { Circle, Image as ImageIcon, Minus, Redo2, Square, Type, Undo2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import type { CardLayerKind } from "@/lib/cards/design/layers";

/** Add text, pictures and shapes to the side being edited; undo and redo. */
export function DesignerToolbar({ full, uploading, canUndo, canRedo, onAdd, onAddImage, onUndo, onRedo }: {
  full: boolean;
  uploading: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onAdd: (kind: Exclude<CardLayerKind, "image">) => void;
  onAddImage: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div role="toolbar" aria-label="Add to the card" className="flex flex-wrap items-center gap-1.5 border-b border-line bg-canvas px-3 py-2">
      <Button size="sm" variant="secondary" startIcon={<Type />} disabled={full} onClick={() => onAdd("text")}>Text</Button>
      <Button size="sm" variant="secondary" startIcon={<ImageIcon />} disabled={full || uploading} loading={uploading} onClick={() => file.current?.click()}>Image</Button>
      <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(event) => { const picked = event.target.files?.[0]; if (picked) onAddImage(picked); event.target.value = ""; }} />
      <Button size="sm" variant="secondary" startIcon={<Square />} disabled={full} onClick={() => onAdd("rect")}>Rectangle</Button>
      <Button size="sm" variant="secondary" startIcon={<Circle />} disabled={full} onClick={() => onAdd("ellipse")}>Ellipse</Button>
      <Button size="sm" variant="secondary" startIcon={<Minus />} disabled={full} onClick={() => onAdd("line")}>Line</Button>
      <span className="ml-auto flex items-center">
        <IconButton size="sm" label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}><Undo2 /></IconButton>
        <IconButton size="sm" label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}><Redo2 /></IconButton>
      </span>
      {full ? <p className="w-full text-caption text-ink-muted">This side holds the most layers it can. Delete one to add another.</p> : null}
    </div>
  );
}
