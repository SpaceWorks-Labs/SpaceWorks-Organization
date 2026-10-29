"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptOwnershipTransfer } from "@/app/actions/ownership";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { Button } from "@/components/ui/button";

/** Shown to the person the owner offered the organisation to, so they can accept it. */
export function OwnershipOfferPanel({ offer }: { offer: { token: string; fromName: string; keepRoleName: string; expiresLabel: string } }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  return (
    <section aria-labelledby="offer-title" className="flex min-w-0 flex-col gap-3 rounded-xl bg-tint-peach p-5">
      <div>
        <h2 id="offer-title" className="text-h4 text-ink">Become the owner</h2>
        <p className="text-body-ui text-ink-secondary">
          {offer.fromName} wants to make you the owner. They&apos;d stay on the team as {offer.keepRoleName}. The offer lasts until {offer.expiresLabel}.
        </p>
      </div>
      <div>
        <Button variant="primary" disabled={pending} onClick={() => setConfirming(true)}>Accept ownership</Button>
      </div>
      <ConfirmationDialog
        open={confirming}
        title="Accept ownership?"
        message="You'll manage the team, staff roles and every setting, and can delete the organisation. You may need to sign in again first."
        confirmLabel="Accept ownership"
        destructive={false}
        loading={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => startTransition(async () => {
          const res = await acceptOwnershipTransfer({ token: offer.token });
          if (!res.ok) {
            showToast(res.error, "error");
            return;
          }
          setConfirming(false);
          showToast("You're the owner now", "success");
          router.refresh();
        })}
      />
    </section>
  );
}
