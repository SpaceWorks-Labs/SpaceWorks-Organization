import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { staffWithCapability } from "@/lib/team/roles";
import { absoluteUrl, sendBrandedEmail } from "./message";

const ERASURE_EVENTS = ["requested", "approved", "rejected"] as const;
type ErasureEvent = (typeof ERASURE_EVENTS)[number];
type ErasurePayload = { requestId: string; organisationId: string; event: ErasureEvent };

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

/** The payload carries ids only; addresses are looked up at send time. */
export function asErasurePayload(value: Prisma.JsonValue): ErasurePayload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || !isId(p.requestId) || !isId(p.organisationId) || !ERASURE_EVENTS.includes(p.event as ErasureEvent)) return null;
  return p as ErasurePayload;
}

/**
 * Erasure emails. "requested" tells org-wide staff who can decide it (by member number, not name);
 * the decision goes to the account that asked, which is never the erased member record itself.
 */
export async function deliverErasureNotice(payload: ErasurePayload, messageId: string): Promise<"sent" | "dropped"> {
  const request = await prisma.erasureRequest.findFirst({
    where: { id: payload.requestId, organisationId: payload.organisationId },
    include: { organisation: { select: { name: true, slug: true } }, member: { select: { id: true, memberNumber: true } } },
  });
  if (!request) return "dropped";
  const org = request.organisation;

  if (payload.event === "requested") {
    if (request.status !== "PENDING") return "dropped";
    const managers = await staffWithCapability(prisma, payload.organisationId, "erasure.decide", { orgWide: true, where: { user: { emailVerified: { not: null } } } });
    const to = managers.slice(0, 20).map((manager) => manager.user.email).filter((email): email is string => Boolean(email));
    if (to.length === 0) return "dropped";
    await sendBrandedEmail({ organisationId: payload.organisationId,
      to: to.join(", "),
      messageId,
      subject: `${org.name}: a member asked to erase their details`,
      heading: "Erasure request",
      paragraphs: [
        `Member no. ${request.member.memberNumber} asked ${org.name} to erase their personal details.`,
        "Review it on their member page. Approving replaces their details for good; payment records are kept.",
      ],
      action: { label: "Review the request", url: absoluteUrl(`/dashboard/${org.slug}/members/${request.member.id}`) },
    });
    return "sent";
  }

  const user = request.requestedByUserId ? await prisma.user.findUnique({ where: { id: request.requestedByUserId }, select: { email: true, emailVerified: true } }) : null;
  if (!user?.email || !user.emailVerified) return "dropped";
  const approved = payload.event === "approved";
  await sendBrandedEmail({ organisationId: payload.organisationId,
    to: user.email,
    messageId,
    subject: approved ? `${org.name} erased your details` : `${org.name} kept your details`,
    heading: approved ? "Your details were erased" : "Erasure request declined",
    paragraphs: approved
      ? [`${org.name} approved your request. Your name, contact details and answers are gone from their records. Payment records stay for 8 years, as the law requires, without your contact details.`]
      : [`${org.name} declined your request to erase your details.`, ...(request.decisionNote ? [`Their note: ${request.decisionNote}`] : []), `Reply to ${org.name} directly if you have questions.`],
    action: { label: "See your account", url: absoluteUrl("/account/privacy") },
  });
  return "sent";
}
