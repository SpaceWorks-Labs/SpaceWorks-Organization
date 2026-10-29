import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { toCsvRow } from "@/lib/csv";

type ExportRows = AsyncIterable<unknown[]> | Iterable<unknown[]>;

type AuditedExport = {
  header: string[];
  rows: ExportRows;
  filename: string;
  audit: { action: "REPORT_EXPORTED" | "FINANCE_REPORT_EXPORTED" | "PLATFORM_REPORT_EXPORTED"; actorUserId: string; organisationId: string | null; report: string; filters: Record<string, string | number | boolean | null> };
};

/**
 * A streamed CSV download that is always audited: who, which report, the filters and the row count.
 * The audit row is written when the stream ends, so the count is exact; a download the client abandons
 * part-way is still recorded, marked incomplete. Cells are formula-guarded by lib/csv.ts toCsvRow.
 */
export async function auditedCsvResponse(input: AuditedExport): Promise<Response> {
  try {
    await recordAuditEvent({
      action: input.audit.action,
      actorUserId: input.audit.actorUserId,
      organisationId: input.audit.organisationId,
      targetType: input.audit.organisationId ? "Organisation" : "Platform",
      targetId: input.audit.organisationId ?? undefined,
      metadata: { report: input.audit.report, stage: "started", ...input.audit.filters },
    });
  } catch {
    console.error("[reports] export refused: the audit row could not be written");
    return new Response("The export couldn't be recorded, so it was not sent. Try again shortly.", { status: 503, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }
  const encoder = new TextEncoder();
  let rowCount = 0;
  let audited = false;
  const audit = async (complete: boolean) => {
    if (audited) return;
    audited = true;
    await recordAuditEvent({
      action: input.audit.action,
      actorUserId: input.audit.actorUserId,
      organisationId: input.audit.organisationId,
      targetType: input.audit.organisationId ? "Organisation" : "Platform",
      targetId: input.audit.organisationId ?? undefined,
      metadata: { report: input.audit.report, rows: rowCount, complete, ...input.audit.filters },
    }).catch(() => console.error("[reports] export audit failed"));
  };
  const iterator = (Symbol.asyncIterator in input.rows ? (input.rows as AsyncIterable<unknown[]>)[Symbol.asyncIterator]() : (input.rows as Iterable<unknown[]>)[Symbol.iterator]()) as AsyncIterator<unknown[]> | Iterator<unknown[]>;
  let started = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(encoder.encode(`﻿${toCsvRow(input.header)}\r\n`));
        }
        // A few hundred rows per pull keeps memory flat for large registers.
        for (let i = 0; i < 250; i += 1) {
          const next = await iterator.next();
          if (next.done) {
            await audit(true);
            controller.close();
            return;
          }
          rowCount += 1;
          controller.enqueue(encoder.encode(`${toCsvRow(next.value)}\r\n`));
        }
      } catch (error) {
        await audit(false);
        controller.error(error);
      }
    },
    async cancel() {
      await audit(false);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${input.filename.replace(/[^a-z0-9._-]/gi, "-")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
