"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { deleteCertificateDesign, restoreCertificateDesign } from "@/app/actions/certificate-designs";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

/**
 * Delete a certificate design, or archive it when certificates were issued from it (they stay valid, downloadable
 * and checkable), and restore an archived one. Deleting or archiving confirms first, naming the design and what
 * happens to its certificates.
 */
export function DesignLifecycleButton({ organisationSlug, designId, designName, issuedCount, archived, after = "stay" }: {
  organisationSlug: string;
  designId: string;
  designName: string;
  issuedCount: number;
  archived: boolean;
  /** Where to go once it is deleted: stay (refresh the list) or back to the certificates page. */
  after?: "stay" | "list";
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const target = { organisationSlug, designId };

  const restore = () => startTransition(async () => {
    const result = await restoreCertificateDesign(target);
    if (result.ok) router.refresh();
    else showToast(result.error, "error");
  });
  const remove = () => startTransition(async () => {
    setError(null);
    const result = await deleteCertificateDesign(target);
    if (!result.ok) return setError(result.error);
    setConfirming(false);
    showToast(result.data?.archived ? `${designName} archived.` : `${designName} deleted.`, "success");
    if (after === "list" && !result.data?.archived) router.push(`/dashboard/${organisationSlug}/certificates`);
    else router.refresh();
  });

  if (archived) return <Button size="sm" variant="secondary" startIcon={<ArchiveRestore />} loading={busy} onClick={restore}>Restore design</Button>;
  const archives = issuedCount > 0;
  return (
    <>
      <Button size="sm" variant="danger" startIcon={<Trash2 />} onClick={() => setConfirming(true)}>{archives ? "Archive design…" : "Delete design…"}</Button>
      <ConfirmDialog
        open={confirming}
        title={archives ? `Archive ${designName}?` : `Delete ${designName}?`}
        message={archives
          ? `Its ${issuedCount.toLocaleString("en-IN")} issued ${issuedCount === 1 ? "certificate stays" : "certificates stay"} valid, downloadable and checkable, but no new ones can be issued from it until you restore it.`
          : "Nothing was issued from it, so it is deleted with its draft. This can't be undone."}
        confirmLabel={archives ? "Archive design" : "Delete design"}
        loading={busy}
        onConfirm={remove}
        onCancel={() => { setConfirming(false); setError(null); }}
      >
        {error ? <p role="alert" className="text-body-ui text-danger-fg">{error}</p> : null}
      </ConfirmDialog>
    </>
  );
}
