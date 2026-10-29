"use client";

import { useState } from "react";
import { IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import type { CardExportFilter, CardExportFormat } from "@/lib/cards/exportFilter";

const FORMATS: Array<{ value: CardExportFormat; label: string; description: string }> = [
  { value: "sheet", label: "A4 print sheets", description: "Cards on A4 pages with crop marks, each front beside its back. For a home printer or a print shop. Up to 1,000 cards." },
  { value: "cards", label: "One card per page", description: "Card-size pages for a PVC card printer. Up to 1,000 cards." },
  { value: "zip", label: "ZIP of PDFs", description: "One PDF per member, named by card number. Up to 300 cards." },
];

/** The download's address: the members page's filter as query parameters. */
function downloadUrl(slug: string, format: CardExportFormat, filter: CardExportFilter) {
  const query = new URLSearchParams({ format });
  if (filter.status !== "all") query.set("status", filter.status);
  if (filter.planId) query.set("plan", filter.planId);
  if (filter.unitId) query.set("unit", filter.unitId);
  if (filter.roleId) query.set("role", filter.roleId);
  if (filter.q) query.set("q", filter.q);
  return `/api/exports/cards/${encodeURIComponent(slug)}?${query}`;
}

/** Save a finished response as a file, under the name the server gave it. */
async function save(response: Response, fallback: string) {
  const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? fallback;
  const href = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/** Download the cards of the members the directory is showing, drawn now from the live designs. */
export function CardExportButton({ slug, filter, description }: { slug: string; filter: CardExportFilter; description: string }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<CardExportFormat>("sheet");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    if (!next) setError(null);
  };
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(downloadUrl(slug, format, filter), { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "The cards couldn't be prepared. Try again.");
        return;
      }
      await save(response, `${slug}-cards.${format === "zip" ? "zip" : "pdf"}`);
      setOpen(false);
    } catch {
      setError("The download stopped before it finished. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" startIcon={<IdCard />} onClick={() => setOpen(true)}>Download cards</Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent size="sm">
          <DialogHeader title="Download cards" description={`Cards for ${description}, drawn now from your current designs. A large batch takes a minute or two.`} />
          <DialogBody className="flex flex-col gap-4">
            {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
            <RadioGroup value={format} onValueChange={(value) => setFormat(value as CardExportFormat)} aria-label="File" className="gap-4">
              {FORMATS.map((item) => <Radio key={item.value} value={item.value} label={item.label} description={item.description} disabled={busy} />)}
            </RadioGroup>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => close(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void download()}>Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
