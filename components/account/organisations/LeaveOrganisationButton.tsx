"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveOrganisation } from "@/app/actions/account-organisations";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/menu";

const SOLE_OWNER_HINT = "Transfer ownership or delete the organisation first.";

export function LeaveOrganisationButton({
  organisationSlug,
  organisationName,
  soleOwner,
}: {
  organisationSlug: string;
  organisationName: string;
  soleOwner: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const hintId = useId();

  if (soleOwner) {
    // A disabled button gets no pointer events, so the focusable wrapper carries the tooltip.
    return (
      <Tooltip content={`You're the only owner. ${SOLE_OWNER_HINT}`}>
        <span tabIndex={0} aria-describedby={hintId} className="inline-flex rounded-full">
          <Button size="sm" variant="secondary" disabled>
            Leave
            <span className="sr-only"> {organisationName}</span>
          </Button>
          <span id={hintId} className="sr-only">You are the only owner. {SOLE_OWNER_HINT}</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setOpen(true)}>
        Leave
        <span className="sr-only"> {organisationName}</span>
      </Button>
      <ConfirmationDialog
        open={open}
        title={`Leave ${organisationName}?`}
        message="You will lose access to its dashboard straight away. Someone who manages the team would need to invite you again. Your own memberships with this organisation are not affected."
        confirmLabel="Leave organisation"
        loading={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const result = await leaveOrganisation({ organisationSlug });
            if (!result.ok) {
              showToast(result.error, "error");
              return;
            }
            setOpen(false);
            showToast(`You left ${organisationName}`, "success");
            router.refresh();
          });
        }}
      />
    </>
  );
}
