"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Mail, RefreshCw } from "lucide-react";
import { emailMemberCard, issueMemberCard, reissueMemberCard, revokeMemberCard } from "@/app/actions/cards";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { MemberCardPlan } from "@/lib/cards/panel";
import { WalletCard } from "./WalletCard";

const RECENT_MS = 2 * 60_000;
const day = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));

/** Play the "card issued" moment once per card per tab, for cards issued in the last two minutes. */
function useCelebration(plans: MemberCardPlan[]) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const fresh = plans.flatMap((plan) => (plan.live && Date.now() - new Date(plan.live.issuedAt).getTime() < RECENT_MS ? [plan.live.cardId] : []));
    if (!fresh.length) return;
    const frame = requestAnimationFrame(() => {
      const unseen = fresh.filter((id) => {
        try {
          if (sessionStorage.getItem(`swo.card-seen.${id}`)) return false;
          sessionStorage.setItem(`swo.card-seen.${id}`, "1");
        } catch {
          // Storage can be blocked; the moment then plays on each visit within two minutes.
        }
        return true;
      });
      if (unseen.length) setIds(unseen);
    });
    return () => cancelAnimationFrame(frame);
  }, [plans]);
  return ids;
}

type Pending = { kind: "reissue" | "revoke"; cardId: string } | null;

/**
 * The member's cards, one per plan: view, download, email, reissue or revoke, and issue where missing. `delight` is
 * the organisation's playful-touches switch: off, the card stays flat and the "card issued" moment doesn't animate.
 */
export function MemberCardPanel({ slug, memberId, memberName, plans, canManage, delight = true }: { slug: string; memberId: string; memberName: string; plans: MemberCardPlan[]; canManage: boolean; delight?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, startTransition] = useTransition();
  const celebrate = useCelebration(plans);
  const done = (result: { ok: boolean; error?: string }, text: string) => {
    setStatus(result.ok ? { ok: true, text } : { ok: false, text: result.error ?? "That didn't work. Try again." });
    setPending(null);
    router.refresh();
  };
  const shown = plans.filter((plan) => plan.started || plan.live || plan.history.length);

  return (
    <Card as="section" className="rounded-xl" aria-labelledby="member-cards-heading">
      <CardHeader title={<span id="member-cards-heading">Cards</span>} description="One card per plan. Renewals keep the same card; its QR always shows the membership as it is now." />
      <div className="flex flex-col gap-5">
        {status ? <Callout tone={status.ok ? "success" : "danger"} role={status.ok ? "status" : "alert"}>{status.text}</Callout> : null}
        {shown.length === 0 ? <p className="text-body-ui text-ink-secondary">A card is issued when a membership starts.</p> : null}
        {shown.map((plan) => (
          <section key={plan.planId} className="flex flex-col gap-4 rounded-xl border border-line p-4" aria-label={`${plan.planName} card`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-h4 text-ink">{plan.planName}</h3>
              {plan.live ? <span className="text-caption tabular-nums text-ink-muted">No. {plan.live.cardNumber} · issued {day(plan.live.issuedAt)}</span> : null}
            </div>
            {plan.live ? (
              <>
                {celebrate.includes(plan.live.cardId) ? (
                  <p role="status" className={`${delight ? "sw-success-in " : ""}inline-flex items-center gap-2 self-center rounded-full bg-success-mark px-3.5 py-1.5 text-label font-semibold text-on-success-mark`}>
                    <BadgeCheck aria-hidden className="size-4" />Card issued
                  </p>
                ) : null}
                <WalletCard
                  design={plan.live.design}
                  holder={plan.live.holder}
                  branding={plan.live.branding}
                  label={`${memberName}'s ${plan.planName} card`}
                  downloads={plan.live.downloads}
                  verifyPath={plan.live.verifyPath}
                  celebrate={celebrate.includes(plan.live.cardId)}
                  delight={delight}
                />
                {canManage ? (
                  <div className="flex flex-wrap justify-center gap-2 border-t border-line pt-4">
                    <Button size="sm" variant="secondary" startIcon={<Mail />} disabled={busy} onClick={() => startTransition(async () => done(await emailMemberCard({ organisationSlug: slug, cardId: plan.live!.cardId }), "Card emailed. It goes out within a minute or two."))}>
                      Email card
                    </Button>
                    <Button size="sm" variant="ghost" startIcon={<RefreshCw />} disabled={busy} onClick={() => setPending({ kind: "reissue", cardId: plan.live!.cardId })}>Reissue</Button>
                    <Button size="sm" variant="dangerQuiet" disabled={busy} onClick={() => setPending({ kind: "revoke", cardId: plan.live!.cardId })}>Revoke card</Button>
                  </div>
                ) : null}
                {plan.live.lastEmailedAt ? <p className="text-center text-caption text-ink-muted">Last emailed {day(plan.live.lastEmailedAt)}.</p> : null}
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-body-ui text-ink-secondary">{plan.history.length ? "No valid card. The last one was revoked." : "No card yet."}</p>
                {canManage && plan.started ? (
                  <Button size="sm" variant="primary" disabled={busy} onClick={() => startTransition(async () => done(await issueMemberCard({ organisationSlug: slug, memberId, planId: plan.planId }), "Card issued."))}>Issue card</Button>
                ) : null}
              </div>
            )}
            {plan.history.length ? (
              <details className="text-caption text-ink-muted">
                <summary className="cursor-pointer select-none text-label text-ink-secondary">Earlier cards ({plan.history.length})</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {plan.history.map((card) => (
                    <li key={card.cardId} className="tabular-nums">No. {card.cardNumber}: issued {day(card.issuedAt)}, {card.state === "replaced" ? "replaced" : "revoked"} {day(card.revokedAt)}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ))}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "reissue" ? "Reissue this card?" : "Revoke this card?"}
        message={pending?.kind === "reissue"
          ? "The member gets a new card with a new QR code. The old card's QR shows it was replaced. The membership is not affected."
          : "The card's QR will show it was revoked. The membership itself is not affected; you can issue a new card later."}
        confirmLabel={pending?.kind === "reissue" ? "Reissue card" : "Revoke card"}
        destructive={pending?.kind === "revoke"}
        loading={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          const { kind, cardId } = pending;
          startTransition(async () => {
            if (kind === "reissue") done(await reissueMemberCard({ organisationSlug: slug, cardId }), "New card issued. The old QR now shows it was replaced.");
            else done(await revokeMemberCard({ organisationSlug: slug, cardId }), "Card revoked.");
          });
        }}
      />
    </Card>
  );
}
