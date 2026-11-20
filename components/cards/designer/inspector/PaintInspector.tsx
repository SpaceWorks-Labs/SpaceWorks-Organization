"use client";

import type { CardPathShapeLayer, CardShapeLayer, CardShapeType } from "@/lib/cards/design/layerTypes";
import { ColourField } from "../ColourField";
import { PatternField, ShadowField } from "./EffectFields";
import { Group, Slider, type ColourContext } from "./fields";
import { GradientEditor } from "./GradientEditor";
import { C } from "./inspectorControls";

type Painted = CardShapeLayer | CardPathShapeLayer;

const POINTED = new Set<CardShapeType>(["star", "burst"]);
const DEEP = new Set<CardShapeType>(["star", "burst", "waveBand", "curveBand", "chevronBand", "diagonalBand", "ribbon", "corner", "cornerRound", "frame"]);
const DEPTH_HINT: Partial<Record<CardShapeType, string>> = { star: "How far the points reach in.", burst: "How far the points reach in.", frame: "Thickness, as a share of the short side." };

/** Fill, gradient, pattern, outline, rounding, points and depth, and shadow of a filled shape. */
export function PaintInspector({ layer, onChange, colours }: { layer: Painted; onChange: (patch: Partial<Painted>) => void; colours: ColourContext }) {
  const shape = layer.kind === "shape" ? layer.shape : null;
  const rounded = layer.kind === "rect" || shape === "frame";
  return (
    <>
      {layer.gradient ? null : <ColourField label={C.fill.label} allowNone value={layer.fill} {...colours} onChange={(fill) => onChange({ fill })} />}
      <GradientEditor value={layer.gradient} fill={layer.fill} onChange={(gradient) => onChange({ gradient })} />
      <ColourField label={C.outline.label} allowNone value={layer.stroke} {...colours} onChange={(stroke) => onChange({ stroke })} />
      {layer.stroke ? <Slider label={C.outlineWidth.label} unit="mm" min={0.1} max={5} step={0.1} value={layer.strokeMm} onChange={(strokeMm) => onChange({ strokeMm })} /> : null}
      {rounded ? <Slider label={C.radius.label} unit="mm" min={0} max={50} step={0.5} value={layer.radiusMm} onChange={(radiusMm) => onChange({ radiusMm })} /> : null}
      {layer.kind === "shape" && shape && POINTED.has(shape) ? <Slider label={C.points.label} unit="" min={3} max={24} step={1} value={layer.points} onChange={(points) => onChange({ points })} /> : null}
      {layer.kind === "shape" && shape && DEEP.has(shape) ? (
        <>
          <Slider label={C.depth.label} unit="%" min={5} max={95} step={1} value={layer.depthPct} onChange={(depthPct) => onChange({ depthPct })} />
          {DEPTH_HINT[shape] ? <p className="text-caption text-ink-muted">{DEPTH_HINT[shape]}</p> : null}
        </>
      ) : null}
      <Group title="Texture and shadow">
        <PatternField value={layer.pattern} colours={colours} onChange={(pattern) => onChange({ pattern })} />
        <ShadowField value={layer.shadow} colours={colours} onChange={(shadow) => onChange({ shadow })} />
      </Group>
    </>
  );
}
