import { fullStops, type GradientGeometry } from "./design/paint";
import { pathD } from "./design/path";
import type { ClipOp, IconOp, VectorOp } from "./vectorOps";

/*
 * SVG for the vector ops (lib/cards/vectorOps.ts), used by the PNG renderer. `alpha` is the layer's
 * opacity, applied to each part as the PDF applies it. `nextId` hands out unique ids for gradients and
 * clip paths within one card.
 */

const n = (value: number) => Number(value.toFixed(3));

function gradientDef(id: string, geometry: GradientGeometry) {
  const stops = fullStops(geometry.stops).map((stop) => `<stop offset="${n(stop.atPct / 100)}" stop-color="${stop.color}"/>`).join("");
  return geometry.type === "linear"
    ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(geometry.x1)}" y1="${n(geometry.y1)}" x2="${n(geometry.x2)}" y2="${n(geometry.y2)}">${stops}</linearGradient>`
    : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(geometry.cx)}" cy="${n(geometry.cy)}" r="${n(geometry.r)}">${stops}</radialGradient>`;
}

export function vectorSvg(op: VectorOp, alpha: number, nextId: () => string) {
  const opacity = alpha * (op.opacity ?? 1);
  const d = pathD(op.cmds);
  let out = "";
  if (op.gradient || op.fill) {
    let fill = op.fill ?? "none";
    if (op.gradient) {
      const id = nextId();
      out += `<defs>${gradientDef(id, op.gradient)}</defs>`;
      fill = `url(#${id})`;
    }
    out += `<path d="${d}" fill="${fill}" fill-rule="${op.nonzero ? "nonzero" : "evenodd"}"${opacity < 1 ? ` fill-opacity="${n(opacity)}"` : ""}/>`;
  }
  if (op.stroke && op.strokeWidth) {
    const dash = op.dash?.length ? ` stroke-dasharray="${op.dash.map(n).join(" ")}"` : "";
    out += `<path d="${d}" fill="none" stroke="${op.stroke}" stroke-width="${n(op.strokeWidth)}" stroke-linejoin="round" stroke-linecap="${op.round ? "round" : "butt"}"${dash}${opacity < 1 ? ` stroke-opacity="${n(opacity)}"` : ""}/>`;
  }
  return out;
}

export function clipSvg(op: ClipOp, alpha: number, nextId: () => string) {
  const id = nextId();
  return `<clipPath id="${id}"><path d="${pathD(op.cmds)}" clip-rule="evenodd"/></clipPath><g clip-path="url(#${id})">${op.ops.map((inner) => vectorSvg(inner, alpha, nextId)).join("")}</g>`;
}

export function iconSvg(op: IconOp, alpha: number) {
  const opacity = alpha * (op.opacity ?? 1);
  return `<path transform="translate(${n(op.x)} ${n(op.y)}) scale(${op.scale.toPrecision(6)})" d="${op.d}" fill="none" stroke="${op.stroke}" stroke-width="${n(op.strokeWidth / op.scale)}" stroke-linecap="round" stroke-linejoin="round"${opacity < 1 ? ` stroke-opacity="${n(opacity)}"` : ""}/>`;
}

/** The transform for a layer group: turn about (cx, cy), then mirror about it when flipped. */
export function groupTransform(op: { rotateDeg: number; cx: number; cy: number; flipX?: boolean; flipY?: boolean }) {
  const parts: string[] = [];
  if (op.rotateDeg) parts.push(`rotate(${n(op.rotateDeg)} ${n(op.cx)} ${n(op.cy)})`);
  if (op.flipX || op.flipY) parts.push(`translate(${n(op.cx)} ${n(op.cy)}) scale(${op.flipX ? -1 : 1} ${op.flipY ? -1 : 1}) translate(${n(-op.cx)} ${n(-op.cy)})`);
  return parts.length ? ` transform="${parts.join(" ")}"` : "";
}
