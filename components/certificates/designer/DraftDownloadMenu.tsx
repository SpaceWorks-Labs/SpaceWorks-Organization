"use client";

import { useState } from "react";
import { Download, FileImage, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";

type Format = "pdf" | "png";

function fileName(response: Response, fallback: string) {
  return /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;
}

/**
 * Download the saved draft (or the live design when there is no draft) drawn with the sample member, through
 * /api/exports/certificate-draft. Any edit still waiting is saved first, so the file matches the screen.
 */
export function DraftDownloadMenu({ organisationSlug, designId, flush, onError }: { organisationSlug: string; designId: string; flush: () => Promise<boolean>; onError: (message: string | null) => void }) {
  const [busy, setBusy] = useState(false);

  const download = async (format: Format) => {
    setBusy(true);
    onError(null);
    try {
      if (!(await flush())) return;
      const params = new URLSearchParams({ design: designId, format });
      const response = await fetch(`/api/exports/certificate-draft/${encodeURIComponent(organisationSlug)}?${params}`, { credentials: "same-origin" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        onError(body?.error ?? "The download didn't start. Try again.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName(response, `certificate-preview.${format}`);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      onError("The download didn't start. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" variant="secondary" startIcon={<Download />} loading={busy} aria-busy={busy || undefined}>
          {busy ? "Preparing preview…" : "Preview"}
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>Last saved draft, with sample details</MenuLabel>
        <MenuItem icon={<FileText />} onSelect={() => void download("pdf")}>Download PDF preview</MenuItem>
        <MenuItem icon={<FileImage />} onSelect={() => void download("png")}>Download PNG preview</MenuItem>
      </MenuContent>
    </Menu>
  );
}
