import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { DocumentSnapshot } from "@/lib/payments/documents";
import { DOCUMENT_KIND_LABELS } from "@/lib/payments/numbering";
import { documentAmount, renderDocumentPdf } from "@/lib/payments/pdf";
import { absoluteUrl, sendBrandedEmail } from "./message";
import { payLinkToken } from "@/lib/payments/payLink";

const PAYMENT_NOTICES = ["paid", "claim-received", "claim-rejected", "refunded"] as const;
type PaymentNotice = (typeof PAYMENT_NOTICES)[number];
type Payload = { organisationId: string; paymentId: string; notice: PaymentNotice };

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

export function asPaymentNoticePayload(value: Prisma.JsonValue): Payload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || !isId(p.organisationId) || !isId(p.paymentId) || !PAYMENT_NOTICES.includes(p.notice as PaymentNotice)) return null;
  return p as Payload;
}

/** Tell a member about their payment, attaching the receipt or credit note PDF when one was issued. */
export async function deliverPaymentNotice(payload: Payload, messageId: string): Promise<"sent" | "dropped"> {
  const payment = await prisma.payment.findFirst({
    where: { id: payload.paymentId, organisationId: payload.organisationId },
    include: {
      member: { select: { name: true, email: true, anonymisedAt: true } },
      organisation: { select: { name: true, slug: true, locale: true, memberPortal: true } },
      documents: { where: { cancelledAt: null }, orderBy: { issuedAt: "desc" } },
    },
  });
  if (!payment || payment.member.anonymisedAt) return "dropped";
  const org = payment.organisation;
  const first = payment.member.name.split(/\s+/)[0] || payment.member.name;
  const amount = documentAmount(payment.capturedMinor ?? payment.amountMinor, payment.currency, org.locale);
  // Without member accounts there is no account to send people to: the pay link (to resubmit) or the public page.
  const account = org.memberPortal ? absoluteUrl("/account") : payload.notice === "claim-rejected" && payment.termId ? absoluteUrl(`/pay/${payLinkToken(payment.termId)}`) : absoluteUrl(`/o/${org.slug}`);
  const wanted = payload.notice === "refunded" ? payment.documents.find((doc) => doc.kind === "CREDIT_NOTE") : payment.documents.find((doc) => doc.kind !== "CREDIT_NOTE");
  const attachments = [];
  if (wanted && (payload.notice === "paid" || payload.notice === "refunded")) {
    try {
      const pdf = await renderDocumentPdf(wanted.snapshot as unknown as DocumentSnapshot);
      attachments.push({ filename: `${wanted.number}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" });
    } catch {
      // The document stays downloadable from the account; a render failure never blocks the email.
    }
  }
  const content = {
    paid: {
      subject: `Payment received by ${org.name}`,
      heading: "Payment received",
      paragraphs: [`Hi ${first}, ${org.name} received your payment of ${amount}.`, wanted ? `Your ${DOCUMENT_KIND_LABELS[wanted.kind].toLowerCase()} ${wanted.number} is attached.` : "Your receipt will follow once the team has reviewed the payment."],
    },
    "claim-received": {
      subject: `${org.name} is checking your payment`,
      heading: "We're checking your payment",
      paragraphs: [`Hi ${first}, thanks for letting ${org.name} know you paid ${amount}${payment.utr ? ` (reference ${payment.utr})` : ""}. Their team will confirm it and we'll email your receipt.`],
    },
    "claim-rejected": {
      subject: `${org.name} couldn't confirm your payment`,
      heading: "Payment not confirmed",
      paragraphs: [`Hi ${first}, ${org.name} couldn't match your payment of ${amount}${payment.utr ? ` with reference ${payment.utr}` : ""}.`, ...(payment.note ? [`Their note: ${payment.note}`] : []), org.memberPortal ? "You can check the reference and submit it again from your account." : "You can check the reference and submit it again from the link below."],
    },
    refunded: {
      subject: `Refund from ${org.name}`,
      heading: "Refund processed",
      paragraphs: [`Hi ${first}, ${org.name} has refunded ${wanted ? documentAmount(wanted.totalMinor, wanted.currency, org.locale) : "part of your payment"}.`, wanted ? `Credit note ${wanted.number} is attached.` : ""].filter(Boolean),
    },
  }[payload.notice];
  await sendBrandedEmail({ organisationId: payload.organisationId, to: payment.member.email, messageId, ...content, action: { label: org.memberPortal ? "See your account" : payload.notice === "claim-rejected" ? "Submit it again" : `Visit ${org.name}`, url: account }, attachments });
  return "sent";
}
