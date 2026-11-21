"use client";

import { useState } from "react";
import { Download, FileImage, FileText, Printer } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import type { CardSide } from "@/lib/cards/design/presets";
import { keepKeysInside } from "./shared";

type Target = { organisationSlug: string; planId: string | null; roleId: string | null; unitId: string | null };
type Kind = "pdf" | "print" | "png";

/** The download address for the saved draft, drawn with the sample or the chosen member. */
export function draftDownloadUrl(target: Target, kind: Kind, side: CardSide, memberId: string | null) {
  const params = new URLSearchParams({ format: kind === "png" ? "png" : "pdf" });
  if (target.planId) params.set("plan", target.planId);
  if (target.roleId) params.set("role", target.roleId);
  if (target.unitId) params.set("unit", target.unitId);
  if (kind === "print") params.set("print", "1");
  if (kind === "png") params.set("side", side);
  if (memberId) params.set("member", memberId);
  return `/api/exports/card-draft/${encodeURIComponent(target.organisationSlug)}?${params}`;
}

function fileName(response: Response, fallback: string) {
  return /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;
}

/**
 * Download the saved draft (not yet approved): both sides as a PDF, a print-ready PDF with 2 mm bleed and crop
 * marks, or a PNG of the side being edited.
 */
export function DownloadMenu({ target, side, memberId, onError }: { target: Target; side: CardSide; memberId: string | null; onError: (message: string | null) => void }) {
  const [busy, setBusy] = useState(false);

  const download = async (kind: Kind) => {
    setBusy(true);
    onError(null);
    try {
      const response = await fetch(draftDownloadUrl(target, kind, side, memberId), { credentials: "same-origin" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        onError(body?.error ?? "The download didn't start. Try again.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName(response, kind === "png" ? "card.png" : "card.pdf");
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
        <IconButton label={busy ? "Preparing download" : "Download draft"} size="sm" aria-busy={busy || undefined} disabled={busy}>
          <Download />
        </IconButton>
      </MenuTrigger>
      <MenuContent onKeyDown={keepKeysInside}>
        <MenuLabel>Last saved draft{memberId ? ", with the chosen member" : ", with sample details"}</MenuLabel>
        <MenuItem icon={<FileText />} onSelect={() => void download("pdf")}>Download PDF</MenuItem>
        <MenuItem icon={<Printer />} description="2 mm bleed and crop marks" onSelect={() => void download("print")}>Download print-ready PDF</MenuItem>
        <MenuItem icon={<FileImage />} onSelect={() => void download("png")}>Download PNG of the {side}</MenuItem>
      </MenuContent>
    </Menu>
  );
}
