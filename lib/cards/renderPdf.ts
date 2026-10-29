import "server-only";

import { concatTransformationMatrix, fill, PDFDocument, popGraphicsState, pushGraphicsState, rectangle, rgb, setFillingColor, setGraphicsState, type Color, type PDFEmbeddedPage, type PDFImage, type PDFOperator, type PDFPage } from "pdf-lib";
import { containBox, ellipsePath, imageCache, loadSymbolPaths, qrModules, roundedRectPath, SYMBOL_VIEWBOX, type PreparedImage } from "./assets";
import { loadCardFonts, type CardFonts } from "./fonts";
import type { CardOp, CardScene } from "./layout";
import type { CardSymbolVariant } from "./palette";
import { drawShapedText, glyphContext, opacityState, type GlyphContext } from "./pdfGlyphs";
import { cropMarks, mmToPt, PT_PER_MM, sheetPlacer } from "./sheet";

/*
 * Cards as PDF: one card side per page at card size, or CR80 sheets on A4 with crop marks. Text is
 * shaped glyph outlines (lib/cards/pdfGlyphs.ts), QR codes and the symbol are vectors, and shared
 * artwork is embedded once per document.
 */

export type CardPdfLayout = "card" | "a4";

function hex(value: string): Color {
  const n = Number.parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

type Context = {
  pdf: PDFDocument;
  fonts: CardFonts;
  glyphs: GlyphContext;
  images: Map<string, Promise<PDFImage | null>>;
  symbols: Map<CardSymbolVariant, Promise<PDFEmbeddedPage>>;
  prepare: ReturnType<typeof imageCache>;
};

/** The symbol drawn once per variant as a reusable form, so each card adds one drawing instruction. */
function symbolForm(context: Context, variant: CardSymbolVariant) {
  let entry = context.symbols.get(variant);
  if (!entry) {
    entry = (async () => {
      const source = await PDFDocument.create();
      const page = source.addPage([SYMBOL_VIEWBOX.width, SYMBOL_VIEWBOX.height]);
      for (const symbolPath of await loadSymbolPaths(variant)) {
        page.drawSvgPath(symbolPath.d, { x: 0, y: SYMBOL_VIEWBOX.height, color: hex(symbolPath.fill) });
      }
      return context.pdf.embedPage(page);
    })();
    context.symbols.set(variant, entry);
  }
  return entry;
}

async function embedImage(context: Context, prepared: PreparedImage | null, cacheKey: string | null) {
  if (!prepared) return null;
  if (cacheKey === null) return prepared.format === "png" ? context.pdf.embedPng(prepared.data) : context.pdf.embedJpg(prepared.data);
  let entry = context.images.get(cacheKey);
  if (!entry) {
    entry = prepared.format === "png" ? context.pdf.embedPng(prepared.data) : context.pdf.embedJpg(prepared.data);
    context.images.set(cacheKey, entry);
  }
  return entry;
}

/** Draw one scene with its top-left corner at (`originXMm`, `originYMm`) on `page`. */
async function drawScene(context: Context, page: PDFPage, scene: CardScene, originXMm: number, originYMm: number) {
  const pageHeight = page.getHeight();
  const x = (mm: number) => mmToPt(originXMm + mm);
  const y = (mm: number) => pageHeight - mmToPt(originYMm + mm);
  const svg = (d: string, options: { fill?: string; stroke?: string; strokeWidth?: number }) =>
    page.drawSvgPath(d, {
      x: x(0),
      y: y(0),
      scale: PT_PER_MM,
      ...(options.fill ? { color: hex(options.fill) } : {}),
      ...(options.stroke ? { borderColor: hex(options.stroke), borderWidth: options.strokeWidth ?? 0.2 } : {}),
    });

  svg(roundedRectPath(0, 0, scene.widthMm, scene.heightMm, 0), { fill: scene.background });
  const draw = async (ops: CardOp[]) => {
    for (const op of ops) {
      if (op.kind === "group") {
        // Turn about the centre (clockwise on the page, so anticlockwise in PDF space) and fade as one.
        const state: PDFOperator[] = [pushGraphicsState()];
        if (op.opacity < 1) state.push(setGraphicsState(opacityState(context.glyphs, page, op.opacity)));
        if (op.rotateDeg) {
          const angle = (-op.rotateDeg * Math.PI) / 180;
          const [cos, sin, px, py] = [Math.cos(angle), Math.sin(angle), x(op.cx), y(op.cy)];
          state.push(concatTransformationMatrix(cos, sin, -sin, cos, px - cos * px + sin * py, py - sin * px - cos * py));
        }
        page.pushOperators(...state);
        await draw(op.ops);
        page.pushOperators(popGraphicsState());
      } else if (op.kind === "ellipse") {
        if (op.fill) svg(ellipsePath(op.x, op.y, op.w, op.h), { fill: op.fill });
        if (op.stroke) {
          const half = (op.strokeWidth ?? 0.2) / 2;
          svg(ellipsePath(op.x + half, op.y + half, op.w - 2 * half, op.h - 2 * half), { stroke: op.stroke, strokeWidth: op.strokeWidth });
        }
      } else if (op.kind === "rect") {
        if (op.fill) svg(roundedRectPath(op.x, op.y, op.w, op.h, op.radius), { fill: op.fill });
        // Strokes are centred on the path, as a CSS border inset by half its width would be.
        if (op.stroke) {
          const half = (op.strokeWidth ?? 0.2) / 2;
          svg(roundedRectPath(op.x + half, op.y + half, op.w - 2 * half, op.h - 2 * half, Math.max(0, op.radius - half)), { stroke: op.stroke, strokeWidth: op.strokeWidth });
        }
      } else if (op.kind === "text") {
        drawShapedText(context.glyphs, context.fonts, page, op, x(op.x), y(op.baseline), hex(op.color));
      } else if (op.kind === "image") {
        const box = { wMm: op.w, hMm: op.h, fit: op.fit, shape: op.shape, grayscale: op.grayscale, background: scene.background, ...(op.alpha ? { alpha: true, radiusMm: op.radiusMm ?? 0 } : {}) };
        const prepared = await context.prepare(op.url, box, !op.photo);
        const image = await embedImage(context, prepared, op.photo ? null : JSON.stringify([op.url, box]));
        if (!image || !prepared) continue;
        const at = op.fit === "cover" ? { x: op.x, y: op.y, w: op.w, h: op.h } : containBox(op, prepared.widthPx, prepared.heightPx);
        page.drawImage(image, { x: x(at.x), y: y(at.y + at.h), width: mmToPt(at.w), height: mmToPt(at.h), ...(op.opacity !== undefined ? { opacity: op.opacity } : {}) });
      } else if (op.kind === "qr") {
        // One rectangle per run of dark modules keeps large documents light.
        const qr = qrModules(op.value);
        const cell = op.size / qr.size;
        page.pushOperators(
          pushGraphicsState(),
          setFillingColor(hex(op.dark)),
          ...qr.runs.map(([column, row, length]) => rectangle(x(op.x + column * cell), y(op.y + (row + 1) * cell), mmToPt(length * cell), mmToPt(cell))),
          fill(),
          popGraphicsState(),
        );
      } else if (op.kind === "symbol") {
        page.drawPage(await symbolForm(context, op.variant), { x: x(op.x), y: y(op.y + op.h), width: mmToPt(op.w), height: mmToPt(op.h) });
      }
    }
  };
  await draw(scene.ops);
}

/**
 * Render cards to one PDF, each card as its sides (front, then back when it has one). Cards arrive as an
 * async iterable so callers can stream members from the database in batches; only the document itself is
 * held in memory.
 */
export async function renderCardsPdf(cards: AsyncIterable<CardScene[]> | Iterable<CardScene[]>, options: { layout: CardPdfLayout; title: string }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(options.title);
  pdf.setCreator("Space Works Organization");
  pdf.setProducer("Space Works Organization");
  const context: Context = { pdf, fonts: await loadCardFonts(), glyphs: glyphContext(pdf), images: new Map(), symbols: new Map(), prepare: imageCache() };

  let index = 0;
  let sheetPage: PDFPage | null = null;
  const place = sheetPlacer();
  for await (const sides of cards) {
    const placements = options.layout === "a4" ? place(sides) : [];
    for (const [side, scene] of sides.entries()) {
      const at = placements[side];
      if (!at) {
        await drawScene(context, pdf.addPage([mmToPt(scene.widthMm), mmToPt(scene.heightMm)]), scene, 0, 0);
        continue;
      }
      if (at.newSheet || !sheetPage) {
        sheetPage = pdf.addPage([mmToPt(at.layout.sheetWidthMm), mmToPt(at.layout.sheetHeightMm)]);
        const height = sheetPage.getHeight();
        for (const mark of cropMarks(at.layout)) {
          sheetPage.drawLine({ start: { x: mmToPt(mark.x1), y: height - mmToPt(mark.y1) }, end: { x: mmToPt(mark.x2), y: height - mmToPt(mark.y2) }, thickness: 0.25, color: rgb(0, 0, 0) });
        }
      }
      await drawScene(context, sheetPage, scene, at.xMm, at.yMm);
    }
    index += sides.length;
  }
  if (index === 0) pdf.addPage([mmToPt(210), mmToPt(297)]);
  return pdf.save({ objectsPerTick: 200 });
}
