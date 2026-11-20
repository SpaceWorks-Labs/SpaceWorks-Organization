"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Callout, Chip, type ChipTone } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { payToUnitLine, type PaymentGuidance } from "@/lib/payments/unitInstructions";
import { useDelight } from "./motion/Delight";
import styles from "./motion/motion.module.css";

const OUTCOME: Record<string, { title: string; body: string; status: string; tone: ChipTone }> = {
  PENDING_APPROVAL: { title: "Application sent", body: "The team will review it and email you their decision.", status: "Waiting for review", tone: "info" },
  PENDING_PAYMENT: { title: "Almost there", body: "Your membership starts once it's paid. Pay now, or later from the link we've emailed you.", status: "Payment due", tone: "warning" },
  ACTIVE: { title: "You're a member", body: "Your membership has started. See it any time in your account.", status: "Active", tone: "success" },
  UPCOMING: { title: "You're all set", body: "Your membership starts soon.", status: "Starts soon", tone: "info" },
};

/**
 * What happened after joining: the status (a word and its colour), the next step, how to pay offline, and any photo
 * warning. It arrives with a short scale-in (delight; never under reduced motion) and takes focus so screen readers
 * hear the result.
 */
export function JoinOutcome({ status, payUrl, accountUrl, payment, warning }: { status: string; payUrl: string | null; accountUrl: string; payment: PaymentGuidance | null; warning: string | null }) {
  const copy = OUTCOME[status] ?? OUTCOME.ACTIVE;
  const delight = useDelight();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className={cn("flex flex-col gap-4 rounded-xl border border-line bg-panel p-6", delight && styles.arrive)}>
      <Chip tone={copy.tone} className="w-fit">{copy.status}</Chip>
      <h2 ref={heading} tabIndex={-1} className="text-h2 text-ink focus:outline-none">{copy.title}</h2>
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
