"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leaveMembership, renewMembership, withdrawTerm } from "@/app/actions/portal";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { payHref } from "@/components/portal/Slots";
import { RenewDetailsDialog, type RenewAsks } from "@/components/portal/RenewDetailsDialog";
import type { WalletState } from "@/lib/portal/walletStatus";

type Confirm = "withdraw" | "leave" | null;

/** What a member can do with one membership right now: pay, renew or rejoin, call off, or leave. */
export function MembershipActions({ organisationSlug, organisationName, planId, planName, actions, due, reask = null }: {
  organisationSlug: string;
  organisationName: string;
  planId: string;
  planName: string;
  actions: WalletState["actions"];
  due: string | null;
  /** What the plan asks again at renewal; the member confirms it before renewing. */
  reask?: RenewAsks | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done: string) => startTransition(async () => {
    const result = await work();
    setConfirm(null);
    showToast(result.ok ? done : result.error ?? "Couldn't do that. Try again.", result.ok ? "success" : "error");
    if (result.ok) router.refresh();
  });

  // After renewing, the refreshed wallet shows the Pay button for an unpaid term.
  const renewed = (status: string | undefined) => {
    showToast(status === "PENDING_PAYMENT" ? "Renewal started. Pay to confirm it." : status === "PENDING_APPROVAL" ? `Sent to ${organisationName} for approval.` : "Renewed.", "success");
    setAsking(false);
    router.refresh();
  };
  const renew = () => {
    if (reask && actions.renew) return setAsking(true);
    startTransition(async () => {
      const result = await renewMembership({ organisationSlug, planId });
      if (!result.ok) return showToast(result.error, "error");
      renewed(result.data?.status);
    });
  };

  const withdrawing = actions.withdrawKind === "renewal" ? "renewal" : "application";
  const any = actions.payTermId || actions.renew || actions.rejoin || actions.withdrawTermId || actions.leave;
  if (!any) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.payTermId ? (
        <Link href={payHref(actions.payTermId)} className={buttonClasses({ variant: "accent", size: "sm" })}>
          {due ? `Pay ${due}` : "Pay now"}
        </Link>
      ) : null}
      {actions.renew || actions.rejoin ? (
        <Button size="sm" variant={actions.payTermId ? "secondary" : "primary"} loading={busy && confirm === null} onClick={renew}>
          {actions.rejoin ? "Rejoin" : "Renew"}
        </Button>
      ) : null}
      {actions.withdrawTermId ? (
        <Button size="sm" variant="ghost" onClick={() => setConfirm("withdraw")}>
          {withdrawing === "renewal" ? "Cancel renewal" : "Withdraw application"}
        </Button>
      ) : null}
      {actions.leave ? (
        <Button size="sm" variant="dangerQuiet" onClick={() => setConfirm("leave")}>Leave</Button>
      ) : null}

      {reask ? <RenewDetailsDialog open={asking} onClose={() => setAsking(false)} organisationSlug={organisationSlug} planId={planId} planName={planName} asks={reask} onRenewed={renewed} /> : null}
      <ConfirmDialog
        open={confirm === "withdraw"}
        title={withdrawing === "renewal" ? "Cancel this renewal?" : "Withdraw this application?"}
        message={withdrawing === "renewal"
          ? `Your current ${planName} membership carries on until it ends. If you already paid for the renewal, ask ${organisationName} about a refund.`
          : `${organisationName} won't review it any further. You can apply again later.`}
        confirmLabel={withdrawing === "renewal" ? "Cancel renewal" : "Withdraw application"}
        cancelLabel="Keep it"
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => withdrawTerm({ organisationSlug, termId: actions.withdrawTermId }), withdrawing === "renewal" ? "Renewal cancelled." : "Application withdrawn.")}
      />
      <ConfirmDialog
        open={confirm === "leave"}
        title={`Leave ${planName}?`}
        message={`Your ${planName} membership with ${organisationName} ends now, along with any renewal you have lined up. Payments already made stay on record and aren't refunded automatically.`}
        confirmLabel="Leave"
        cancelLabel="Stay a member"
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => leaveMembership({ organisationSlug, planId }), `You've left ${planName}.`)}
      />
    </div>
  );
}
