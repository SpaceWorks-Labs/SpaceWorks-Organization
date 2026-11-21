import Link from "next/link";
import { Award } from "lucide-react";
import { Chip, type ChipTone } from "@/components/ui/display";
import { ORIENTATION_LABELS, type CertificateOrientation, type CertificatePageSize } from "@/lib/certificates/pages";

export type DesignSummary = {
  id: string;
  name: string;
  typeLabel: string;
  pageSize: CertificatePageSize;
  orientation: CertificateOrientation;
  widthMm: number;
  heightMm: number;
  live: boolean;
  pending: boolean;
  archived: boolean;
  issuedCount: number;
  validCount: number;
};

const PAGE_NAMES: Record<CertificatePageSize, string> = { A4: "A4", LETTER: "US Letter" };

export function designStatus(design: Pick<DesignSummary, "live" | "pending" | "archived">): { label: string; tone: ChipTone } {
  if (design.archived) return { label: "Archived", tone: "neutral" };
  if (!design.live) return { label: "Draft, not approved", tone: "warning" };
  if (design.pending) return { label: "Live, changes waiting", tone: "warning" };
  return { label: "Live", tone: "success" };
}

/**
 * The organisation's certificate designs as cards: a page-shaped mark in the design's orientation, its name, type,
 * page, where it stands (draft, live, changes waiting, archived) and how many certificates it has issued. Each
 * opens the designer when the viewer may design, else the issue page for live designs.
 */
export function DesignCards({ slug, designs, canDesign, canIssue }: { slug: string; designs: DesignSummary[]; canDesign: boolean; canIssue: boolean }) {
  const base = `/dashboard/${slug}/certificates`;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {designs.map((design) => {
        const status = designStatus(design);
        const href = canDesign ? `${base}/designs/${design.id}` : canIssue && design.live && !design.archived ? `${base}/issue?design=${design.id}` : null;
        const body = (
          <>
            <span aria-hidden className="flex size-14 shrink-0 items-center justify-center">
              <span className="flex items-center justify-center rounded-md border border-line-strong bg-subtle text-ink-muted" style={{ aspectRatio: `${design.widthMm} / ${design.heightMm}`, [design.widthMm > design.heightMm ? "width" : "height"]: "100%" }}>
                <Award className="size-5" />
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="break-words text-label font-semibold text-ink">{design.name}</span>
              <span className="text-caption text-ink-muted">{design.typeLabel} · {PAGE_NAMES[design.pageSize]} {ORIENTATION_LABELS[design.orientation].toLowerCase()}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <Chip size="sm" tone={status.tone}>{status.label}</Chip>
                <span className="text-caption tabular-nums text-ink-secondary">
                  {design.issuedCount.toLocaleString("en-IN")} issued{design.issuedCount > design.validCount ? `, ${(design.issuedCount - design.validCount).toLocaleString("en-IN")} revoked` : ""}
                </span>
              </span>
            </span>
          </>
        );
        const card = "flex h-full items-start gap-3 rounded-xl border border-line bg-panel p-4";
        return (
          <li key={design.id}>
            {href ? (
              <Link href={href} className={`${card} transition-colors duration-(--sw-dur-fast) ease-sw hover:border-line-strong hover:bg-subtle motion-reduce:transition-none`}>{body}</Link>
            ) : (
              <div className={card}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
