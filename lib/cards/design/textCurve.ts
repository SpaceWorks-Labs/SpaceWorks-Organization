/*
 * Curved text: one line bent along a circular arc centred across its box. `curve` 100 bends it into a
 * half circle over the top (like the top of a seal), -100 into a half circle underneath (a smile);
 * smaller values bend it less. Shared by the PDF/PNG ops and the designer canvas, which draws the same
 * arc as an SVG text path.
 */

export type CurveBox = { xMm: number; yMm: number; wMm: number; hMm: number; curve: number };

/** The arc: its centre, radius and whether it bulges upward. Null when the text is straight. */
export function curveArc(box: CurveBox, ascentMm: number, descentMm: number) {
  if (box.curve === 0) return null;
  const sweep = (Math.abs(box.curve) / 100) * Math.PI;
  const radius = box.wMm / 2 / Math.sin(sweep / 2);
  const up = box.curve > 0;
  const cx = box.xMm + box.wMm / 2;
  // Over the top: the highest baseline point sits one ascent below the box top. Underneath: the
  // lowest sits one descent above the box bottom.
  const apexY = up ? box.yMm + ascentMm : box.yMm + box.hMm - descentMm;
  return { cx, cy: up ? apexY + radius : apexY - radius, radius, up };
}

/** Where each character starts (its baseline origin) and how far it turns, centred on the arc's apex. */
export function curveGeometry(box: CurveBox, advances: readonly number[], ascentMm: number, descentMm: number) {
  const arc = curveArc(box, ascentMm, descentMm);
  const total = advances.reduce((sum, value) => sum + value, 0);
  if (!arc) {
    let x = box.xMm + (box.wMm - total) / 2;
    return advances.map((advance) => {
      const at = { x, y: box.yMm + ascentMm, rotateDeg: 0 };
      x += advance;
      return at;
    });
  }
  let run = 0;
  return advances.map((advance) => {
    const middle = run + advance / 2 - total / 2;
    run += advance;
    const angle = middle / arc.radius;
    const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
    // Point on the arc under the character's middle, the tangent there, and the start half an advance back.
    const px = arc.cx + arc.radius * sin;
    const py = arc.up ? arc.cy - arc.radius * cos : arc.cy + arc.radius * cos;
    const tangent = arc.up ? [cos, sin] : [cos, -sin];
    const rotateDeg = ((arc.up ? angle : -angle) * 180) / Math.PI;
    return { x: px - (tangent[0]! * advance) / 2, y: py - (tangent[1]! * advance) / 2, rotateDeg: Math.round(rotateDeg * 100) / 100 };
  });
}

/** The arc as an SVG path from left to right, for the canvas's text path. */
export function curvePathD(box: CurveBox, ascentMm: number, descentMm: number, pxPerMm: number) {
  const arc = curveArc(box, ascentMm, descentMm);
  if (!arc) return null;
  const s = (value: number) => (value * pxPerMm).toFixed(2);
  // A full circle's worth of arc either side, so long text never runs off the path.
  const [x0, x1] = [arc.cx - arc.radius, arc.cx + arc.radius];
  const y = arc.cy;
  const r = s(arc.radius);
  return arc.up
    ? `M${s(x0 - box.xMm)} ${s(y - box.yMm)}A${r} ${r} 0 0 1 ${s(x1 - box.xMm)} ${s(y - box.yMm)}`
    : `M${s(x0 - box.xMm)} ${s(y - box.yMm)}A${r} ${r} 0 0 0 ${s(x1 - box.xMm)} ${s(y - box.yMm)}`;
}
