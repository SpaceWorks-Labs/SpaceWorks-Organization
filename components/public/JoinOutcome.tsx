import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { payToUnitLine, type PaymentGuidance } from "@/lib/payments/unitInstructions";

const OUTCOME: Record<string, { title: string; body: string }> = {
  PENDING_APPROVAL: { title: "Application sent", body: "The team will review it and email you their decision." },
  PENDING_PAYMENT: { title: "Almost there", body: "Your membership starts once it's paid. Pay now, or later from the link we've emailed you." },
  ACTIVE: { title: "You're a member", body: "Your membership has started. See it any time in your account." },
  UPCOMING: { title: "You're all set", body: "Your membership starts soon." },
};

/** What happened after joining: the next step, how to pay offline, and any photo warning. */
export function JoinOutcome({ status, payUrl, accountUrl, payment, warning }: { status: string; payUrl: string | null; accountUrl: string; payment: PaymentGuidance | null; warning: string | null }) {
  const copy = OUTCOME[status] ?? OUTCOME.ACTIVE;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6">
      <h2 className="text-h2 text-ink">{copy.title}</h2>
      <p className="text-body-ui text-ink-secondary">{copy.body}</p>
      {warning ? <Callout tone="warning" role="status">{warning}</Callout> : null}
      {status === "PENDING_PAYMENT" && payment && (payToUnitLine(payment) || payment.instructions) ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
          <h3 className="text-label font-semibold text-ink">{payToUnitLine(payment) ? "Pay your fee to your unit" : "How to pay"}</h3>
          {payment.unitName && payment.offlineOnly ? <p className="text-body-ui text-ink">{payment.unitName}</p> : null}
          {payment.instructions ? <p className="whitespace-pre-wrap text-body-ui text-ink-secondary">{payment.instructions}</p> : null}
        </div>
      ) : null}
      <div>
        {status === "PENDING_PAYMENT" && payUrl ? (
          <a href={payUrl} className={buttonClasses({ variant: "accent" })}>Pay now</a>
        ) : accountUrl === "/account" ? (
          <Link href="/account" className={buttonClasses({ variant: "accent" })}>Go to your account</Link>
        ) : (
          <Link href={accountUrl} className={buttonClasses({ variant: "accent" })}>Back to the organisation</Link>
        )}
      </div>
    </div>
  );
}
