import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { absoluteUrl, sendBrandedEmail } from "@/lib/email/message";

const OWNERSHIP_NOTICES = ["offered", "accepted-new-owner", "accepted-previous-owner"] as const;
type OwnershipNotice = (typeof OWNERSHIP_NOTICES)[number];
type Payload = { to: string; transferId: string; notice: OwnershipNotice };

const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

export function asOwnershipPayload(value: Prisma.JsonValue): Payload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || !isText(p.to, 320) || !isText(p.transferId, 64) || !OWNERSHIP_NOTICES.includes(p.notice as OwnershipNotice)) return null;
  return p as Payload;
}

/**
 * Account emails about an ownership transfer, through the platform's own mail server: the offer to the proposed owner,
 * and the outcome to both people. An offer that is no longer open, or an outcome that never happened, is dropped.
 */
export async function deliverOwnershipNotice(payload: Payload, messageId: string): Promise<"sent" | "dropped"> {
  const transfer = await prisma.ownershipTransfer.findUnique({
    where: { id: payload.transferId },
    include: { organisation: { select: { name: true, slug: true } }, fromUser: { select: { name: true } }, toUser: { select: { name: true } }, keepRole: { select: { name: true } } },
  });
  if (!transfer) return "dropped";
  const { organisation } = transfer;
  const team = absoluteUrl(`/dashboard/${organisation.slug}/team`);
  const from = transfer.fromUser.name ?? "The owner";
  const to = transfer.toUser.name ?? "Your chosen team member";
  if (payload.notice === "offered") {
    if (transfer.acceptedAt || transfer.cancelledAt || transfer.expiresAt <= new Date()) return "dropped";
    await sendBrandedEmail({
      to: payload.to,
      messageId,
      subject: `${from} wants you to own ${organisation.name}`,
      heading: "Become the owner",
      paragraphs: [
        `${from} wants to make you the owner of ${organisation.name}. As owner you manage the team, staff roles and every setting, and can delete the organisation.`,
        `If you accept, they stay on the team as ${transfer.keepRole.name}.`,
      ],
      action: { label: "Review the transfer", url: team },
      footnote: `The offer lasts until ${transfer.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Sign in as yourself to accept it.`,
    });
    return "sent";
  }
  if (!transfer.acceptedAt) return "dropped";
  const content = payload.notice === "accepted-new-owner"
    ? {
      subject: `You now own ${organisation.name}`,
      heading: "You're the owner now",
      paragraphs: [`You accepted ownership of ${organisation.name}. ${from} stays on the team as ${transfer.keepRole.name}.`],
      action: { label: "Open the dashboard", url: absoluteUrl(`/dashboard/${organisation.slug}`) },
    }
    : {
      subject: `${to} now owns ${organisation.name}`,
      heading: "Ownership transferred",
      paragraphs: [
        `${to} accepted ownership of ${organisation.name}. You stay on the team as ${transfer.keepRole.name}.`,
        "If you didn't offer this, contact the new owner or the platform operator straight away.",
      ],
      action: { label: "View the team", url: team },
    };
  await sendBrandedEmail({ to: payload.to, messageId, ...content });
  return "sent";
}
