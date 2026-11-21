import { describe, expect, it } from "vitest";
import { normalizeCertificateSide } from "@/lib/certificates/design";
import { CERTIFICATE_LAYOUTS, certificateLayoutLayers } from "@/lib/certificates/layouts";
import { pageDimensions, type CertificatePage } from "@/lib/certificates/pages";

const PAGES: CertificatePage[] = [
  { pageSize: "A4", orientation: "LANDSCAPE" },
  { pageSize: "A4", orientation: "PORTRAIT" },
  { pageSize: "LETTER", orientation: "LANDSCAPE" },
  { pageSize: "LETTER", orientation: "PORTRAIT" },
];

describe("certificate layouts", () => {
  for (const layout of CERTIFICATE_LAYOUTS) {
    for (const page of PAGES) {
      it(`${layout.id} survives normalising whole and inside the page at ${page.pageSize} ${page.orientation.toLowerCase()}`, () => {
        const size = pageDimensions(page.pageSize, page.orientation);
        const raw = certificateLayoutLayers(layout.id, size.widthMm, size.heightMm);
        const side = normalizeCertificateSide({ backgroundColor: "white", layers: raw }, { organisationName: "Org" }, page);
        expect(side.layers.map((layer) => layer.id)).toEqual(raw.map((layer) => layer.id));
        for (const layer of side.layers) {
          expect(layer.id).toMatch(/^l[a-z0-9]{3,24}$/);
          expect(layer.xMm).toBeGreaterThanOrEqual(0);
          expect(layer.yMm).toBeGreaterThanOrEqual(0);
          expect(layer.xMm + layer.wMm).toBeLessThanOrEqual(size.widthMm + 0.1);
          expect(layer.yMm + layer.hMm).toBeLessThanOrEqual(size.heightMm + 0.1);
        }
        expect(side.layers.some((layer) => layer.kind === "qr")).toBe(true);
        expect(side.layers.some((layer) => layer.kind === "text" && layer.text.includes("{member.name}"))).toBe(true);
        expect(side.showName || side.showQr || side.showPhoto).toBe(false);
      });
    }
  }
});
