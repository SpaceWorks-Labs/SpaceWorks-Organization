import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { staffWithCapability } from "@/lib/team/roles";
import { money } from "@/lib/membership/describe";
import { absoluteUrl, sendBrandedEmail } from "./message";

const REFUND_EVENTS = ["requested", "approved", "declined"] as const;
type RefundEvent = (typeof REFUND_EVENTS)[number];
type RefundPayload = { requestId: string; organisationId: string; event: RefundEvent };

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

/** The payload carries ids only; addresses and amounts are looked up at send time. */
export function asRefundPayload(value: Prisma.JsonValue): RefundPayload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || !isId(p.requestId) || !isId(p.organisationId) || !REFUND_EVENTS.includes(p.event as RefundEvent)) return null;
  return p as RefundPayload;
}

/**
 * Refund request emails. "requested" goes to the organisation-wide finance team (owners, managers and
 * treasurers); the decision goes to the account that asked.
 */
export async function deliverRefundNotice(payload: RefundPayload, messageId: string): Promise<"sent" | "dropped"> {
  const request = await prisma.refundRequest.findFirst({
    where: { id: payload.requestId, organisationId: payload.organisationId },
    include: {
      organisation: { select: { name: true, slug: true, locale: true } },
      member: { select: { memberNumber: true } },
      term: { select: { plan: { select: { name: true } } } },
      refund: { select: { amountMinor: true, status: true } },
    },
  });
  if (!request) return "dropped";
  const org = request.organisation;
  const amount = (minor: number) => money(minor, request.currency, org.locale);

  if (payload.event === "requested") {
    if (request.status !== "OPEN") return "dropped";
    const team = await staffWithCapability(prisma, payload.organisationId, "payments.manage", { orgWide: true, where: { user: { emailVerified: { not: null } } } });
    const to = team.slice(0, 20).map((member) => member.user.email).filter((email): email is string => Boolean(email));
    if (to.length === 0) return "dropped";
    await sendBrandedEmail({ organisationId: payload.organisationId,
      to: to.join(", "),
      messageId,
      subject: `${org.name}: a member asked to cancel with a refund`,
      heading: "Refund request",
      paragraphs: [
        `Member no. ${request.member.memberNumber} asked to cancel ${request.term.plan.name} and get ${amount(request.suggestedMinor)} back under your refund policy.`,
        "Approve it to refund the money and end the membership, or decline it with a note. Their membership carries on until you decide.",
      ],
      action: { label: "Review the request", url: absoluteUrl(`/dashboard/${org.slug}/payments/${request.paymentId}`) },
    });
    return "sent";
  }

  const user = request.requestedByUserId ? await prisma.user.findUnique({ where: { id: request.requestedByUserId }, select: { email: true, emailVerified: true } }) : null;
  if (!user?.email || !user.emailVerified) return "dropped";
  const approved = payload.event === "approved";
  const refunded = request.refund ? amount(request.refund.amountMinor) : amount(request.suggestedMinor);
  await sendBrandedEmail({ organisationId: payload.organisationId,
    to: user.email,
    messageId,
    subject: approved ? `${org.name} approved your refund` : `${org.name} declined your refund request`,
    heading: approved ? "Refund approved" : "Refund request declined",
    paragraphs: approved
      ? [
        `${org.name} approved a refund of ${refunded} for ${request.term.plan.name}.`,
        request.refund?.status === "PROCESSED" ? "The money has been returned." : "Card and UPI refunds usually reach you within 5 to 7 working days.",
        ...(request.decisionNote ? [`Their note: ${request.decisionNote}`] : []),
      ]
      : [`${org.name} declined your refund request, so you stay on ${request.term.plan.name}.`, ...(request.decisionNote ? [`Their note: ${request.decisionNote}`] : [])],
    action: { label: "See your membership", url: absoluteUrl(`/account/memberships/${org.slug}`) },
  });
  return "sent";
}
