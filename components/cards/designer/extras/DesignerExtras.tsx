"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, History } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import type { CardDesign, CardSide } from "@/lib/cards/design/presets";
import type { CardHolder } from "@/lib/cards/types";
import { DownloadMenu } from "./DownloadMenu";
import { PreviewMemberPicker, type PreviewMember } from "./PreviewMemberPicker";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { VersionHistoryDialog } from "./VersionHistoryDialog";

export type DesignerExtrasProps = {
  organisationSlug: string;
  planId: string | null;
  roleId: string | null;
  unitId: string | null;
  design: CardDesign;
  side: CardSide;
  /** Replace the whole design (one undo step). */
  onRestore: (design: CardDesign) => void;
  /** Preview the card with this holder instead of the sample; null goes back to the sample. */
  onPreviewHolder: (holder: CardHolder | null) => void;
};

/** Version history, saving as an organisation template, previewing with a member and downloads, next to the save status. */
export function DesignerExtras({ organisationSlug, planId, roleId, unitId, design, side, onRestore, onPreviewHolder }: DesignerExtrasProps) {
  const [dialog, setDialog] = useState<"history" | "template" | null>(null);
  const [member, setMember] = useState<PreviewMember | null>(null);
  const [message, setMessage] = useState<{ tone: "status" | "error"; text: string } | null>(null);
  const target = { organisationSlug, planId, roleId, unitId };

  // Confirmations fade after a few seconds; errors stay until the next try.
  useEffect(() => {
    if (message?.tone !== "status") return;
    const timer = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <div className="flex items-center gap-1">
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "max-w-[260px] text-caption text-danger-fg" : "max-w-[260px] text-caption text-ink-muted"}>
          {message.text}
        </p>
      ) : null}
      <IconButton label="Version history" size="sm" onClick={() => setDialog("history")}>
        <History />
      </IconButton>
      <IconButton label="Save as organisation template" size="sm" onClick={() => setDialog("template")}>
        <BookmarkPlus />
      </IconButton>
      <PreviewMemberPicker target={target} chosen={member} onChosen={setMember} onPreviewHolder={onPreviewHolder} />
      <DownloadMenu target={target} side={side} memberId={member?.id ?? null} onError={(text) => setMessage(text ? { tone: "error", text } : null)} />
      {dialog === "history" ? (
        <VersionHistoryDialog
          open
          onOpenChange={(open) => setDialog(open ? "history" : null)}
          target={target}
          side={side}
          onRestore={(restored) => {
            onRestore(restored);
            setMessage({ tone: "status", text: "Version restored as the draft. The owner approves it before cards change." });
          }}
        />
      ) : null}
      <SaveTemplateDialog
        open={dialog === "template"}
        onOpenChange={(open) => setDialog(open ? "template" : null)}
        organisationSlug={organisationSlug}
        design={design}
        onSaved={(name) => setMessage({ tone: "status", text: `Saved “${name}” to your templates.` })}
      />
    </div>
  );
}
