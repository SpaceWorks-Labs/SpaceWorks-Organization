import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { zipStream } from "@/lib/cards/zip";
import { BULK_PDF_LIMIT, BULK_ZIP_LIMIT, certificateFileBase } from "./core";
import { CERTIFICATE_INCLUDE, certificateBranding, certificateValues, holderFor, liveSide, loadCertificateUnits, type CertificateOrgContext } from "./data";
import { certificatePdfEntries, renderCertificatesPdf, type CertificateInput } from "./render";

/*
 * Bulk certificate downloads, drawn in the request from the live designs and never stored
 * (app/api/exports/certificates/[orgSlug]/route.ts). Callers hold the render slot (lib/cards/renderSlot.ts) and
 * hand its release to these builders, which call it once the file is done, fails or the download stops.
 */

const PAGE = 100;

export const certificateExportLimit = (format: "zip" | "pdf") => (format === "zip" ? BULK_ZIP_LIMIT : BULK_PDF_LIMIT);

/** The certificates matching `where`, page by page, each ready to draw. Certificates of a design never approved are skipped. */
async function* certificatesMatching(ctx: CertificateOrgContext, where: Prisma.CertificateWhereInput) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.certificate.findMany({ where, include: CERTIFICATE_INCLUDE, orderBy: { id: "asc" }, take: PAGE, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    await loadCertificateUnits(ctx, rows);
    for (const row of rows) {
      const side = liveSide(ctx, row.design);
      if (!side || row.member.anonymisedAt) continue;
      const input: CertificateInput = { side, branding: certificateBranding(ctx), values: certificateValues(row, ctx), holder: holderFor(row, ctx) };
      yield { input, name: `${certificateFileBase(row.certificateNumber, row.member.name)}.pdf`, title: `${row.title} - ${row.member.name}` };
    }
    if (rows.length < PAGE) return;
    cursor = rows.at(-1)!.id;
  }
}

/** A ZIP of one PDF per certificate, written as each is drawn. */
export function certificatesZipStream(ctx: CertificateOrgContext, where: Prisma.CertificateWhereInput, release: () => void) {
  return zipStream(certificatePdfEntries(certificatesMatching(ctx, where)), release);
}

/**
 * Every certificate in one PDF, a page each. The PDF can only be written once it is complete, so the response
 * starts at once and the body follows when the render is done.
 */
export function certificatesPdfStream(ctx: CertificateOrgContext, where: Prisma.CertificateWhereInput, release: () => void) {
  let sent = false;
  async function* inputs() {
    for await (const item of certificatesMatching(ctx, where)) yield item.input;
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (sent) return;
      sent = true;
      try {
        controller.enqueue(await renderCertificatesPdf(inputs(), `${ctx.organisation.name} certificates`));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        release();
      }
    },
    // A render already under way keeps the slot until it ends, so two never run at once.
    cancel: () => {
      if (!sent) release();
    },
  });
}
