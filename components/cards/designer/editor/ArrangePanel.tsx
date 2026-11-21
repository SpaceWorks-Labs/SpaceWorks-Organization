"use client";

import type { ReactNode } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical,
  AlignVerticalDistributeCenter, ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, ClipboardPaste, Copy, CopyPlus, Eye, EyeOff, FlipHorizontal2, FlipVertical2,
  Group, Lock, PaintBucket, Paintbrush, Scissors, Trash2, Ungroup, Unlock,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { selectionUnits } from "@/lib/cards/design/editor/align";
import { canFlipSelection } from "@/lib/cards/design/editor/clipboard";
import { isOneGroup } from "@/lib/cards/design/editor/groups";
import { canMoveInOrder } from "@/lib/cards/design/editor/order";
import { styleFits } from "@/lib/cards/design/editor/style";
import type { CardLayer } from "@/lib/cards/design/layerTypes";
import { reword, useDesignerNoun } from "../wording";
import { ALIGN_CONTROLS, EDIT_CONTROLS, ORDER_CONTROLS, withShortcut } from "./arrangeControls";
import type { EditorActions } from "./useEditorActions";

const ALIGN_ICONS = {
  "align-left": AlignStartVertical, "align-centre": AlignCenterVertical, "align-right": AlignEndVertical,
  "align-top": AlignStartHorizontal, "align-middle": AlignCenterHorizontal, "align-bottom": AlignEndHorizontal,
  "distribute-x": AlignHorizontalDistributeCenter, "distribute-y": AlignVerticalDistributeCenter,
};
const ORDER_ICONS = { "order-front": ChevronsUp, "order-forward": ChevronUp, "order-backward": ChevronDown, "order-back": ChevronsDown };
const label = (id: (typeof EDIT_CONTROLS)[number]["id"]) => {
  const control = EDIT_CONTROLS.find((item) => item.id === id)!;
  return withShortcut(control.label, "shortcut" in control ? control.shortcut : undefined);
};

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="toolbar" aria-label={title} className="flex flex-wrap items-center gap-0.5">
      {children}
    </div>
  );
}

/**
 * Arranging the selected layers: align and space them, group them, stack them, flip, copy and paste,
 * lock, hide and copy a style. With one item, aligning lines it up with the card.
 */
export function ArrangePanel({ layers, selected, order, selection, actions }: { layers: CardLayer[]; selected: CardLayer[]; order: string[]; selection: readonly string[]; actions: EditorActions }) {
  const noun = useDesignerNoun();
  const ids = selected.map((layer) => layer.id);
  const units = selectionUnits(layers, ids).length;
  const grouped = isOneGroup(layers, ids);
  const anyGrouped = selected.some((layer) => layer.groupId);
  const allLocked = selected.length > 0 && selected.every((layer) => layer.locked);
  const allHidden = selected.length > 0 && selected.every((layer) => layer.hidden);
  const fits = actions.style ? selected.some((layer) => styleFits(actions.style!, layer)) : false;

  return (
    <section aria-labelledby="arrange-heading" className="flex flex-col gap-2">
      <h3 id="arrange-heading" className="text-label font-semibold text-ink">Arrange</h3>
      <Row title="Stacking and paste">
        {ORDER_CONTROLS.map((control) => {
          const Icon = ORDER_ICONS[control.id];
          return (
            <IconButton key={control.id} size="sm" label={withShortcut(control.label, control.shortcut)} disabled={!canMoveInOrder(order, selection, control.move)} onClick={() => actions.order(control.move)}>
              <Icon />
            </IconButton>
          );
        })}
        <IconButton size="sm" label={label("paste")} disabled={!actions.clipboard} onClick={actions.paste}><ClipboardPaste /></IconButton>
      </Row>
      {ids.length === 0 ? null : (
        <>
          <Row title={units === 1 ? reword("Align to the card", noun) : "Align the selection"}>
            {ALIGN_CONTROLS.map((control) => {
              const Icon = ALIGN_ICONS[control.id];
              const distribute = "axis" in control;
              const name = !distribute && units === 1 ? reword(`${control.label} on the card`, noun) : control.label;
              return (
                <IconButton key={control.id} size="sm" label={name} disabled={distribute ? units < 3 : units < 1} onClick={() => ("axis" in control ? actions.distribute(control.axis) : actions.align(control.edge))}>
                  <Icon />
                </IconButton>
              );
            })}
          </Row>
          <Row title="Group and flip">
            <IconButton size="sm" label={label("group")} disabled={ids.length < 2 || grouped} onClick={actions.group}><Group /></IconButton>
            <IconButton size="sm" label={label("ungroup")} disabled={!anyGrouped} onClick={actions.ungroup}><Ungroup /></IconButton>
            <IconButton size="sm" label={label("flip-x")} disabled={!canFlipSelection(layers, ids)} onClick={() => actions.flip("x")}><FlipHorizontal2 /></IconButton>
            <IconButton size="sm" label={label("flip-y")} disabled={!canFlipSelection(layers, ids)} onClick={() => actions.flip("y")}><FlipVertical2 /></IconButton>
          </Row>
          <Row title="Edit">
            <IconButton size="sm" label={label("duplicate")} onClick={actions.duplicate}><CopyPlus /></IconButton>
            <IconButton size="sm" label={label("copy")} onClick={actions.copy}><Copy /></IconButton>
            <IconButton size="sm" label={label("cut")} disabled={allLocked} onClick={actions.cut}><Scissors /></IconButton>
            <IconButton size="sm" label={allLocked ? "Unlock" : label("lock")} aria-pressed={allLocked} onClick={actions.toggleLock}>{allLocked ? <Lock /> : <Unlock />}</IconButton>
            <IconButton size="sm" label={allHidden ? "Show" : label("hide")} aria-pressed={allHidden} onClick={actions.toggleHidden}>{allHidden ? <EyeOff /> : <Eye />}</IconButton>
            <IconButton size="sm" variant="danger" label={label("delete")} disabled={allLocked} onClick={actions.remove}><Trash2 /></IconButton>
          </Row>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" startIcon={<Paintbrush />} disabled={ids.length !== 1 && !actions.painting} aria-pressed={actions.painting} onClick={actions.painting ? actions.stopPainting : actions.copyStyle}>
              {actions.painting ? "Stop copying style" : label("copy-style")}
            </Button>
            {actions.style ? <Button size="sm" variant="secondary" startIcon={<PaintBucket />} disabled={!fits} onClick={actions.applyStyle}>{label("apply-style")}</Button> : null}
          </div>
        </>
      )}
      <p className="text-caption text-ink-muted" aria-live="polite">
        {actions.painting ? "Click a layer to give it this style, or select layers and choose Apply copied style. Esc stops." : reword("Shift-click or drag across the card to select several. Press ? for shortcuts.", noun)}
      </p>
    </section>
  );
}
