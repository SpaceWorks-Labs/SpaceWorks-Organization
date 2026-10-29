import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadCardForRender } from "@/lib/cards/data";
import { renderMemberCard } from "@/lib/cards/render";
import { safeFileName, slugForFile } from "@/lib/downloads";
import { absoluteUrl, sendBrandedEmail } from "./message";
import { orgTemplateContent } from "./orgTemplates";

/*
 * "Email card": the member's card as a PDF attachment, queued by a manager or when a card is first issued on
 * activation. The row holds only ids; the card is rendered when the email goes out, so it always carries the
 * current valid-until date, and a card revoked or replaced meanwhile is never sent. The wording is the
 * organisation's "card-issued" template when it has one.
 */

type CardPayload = { cardId: string; organisationId: string };

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

export function asMemberCardPayload(value: Prisma.JsonValue): CardPayload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || !isId(p.cardId) || !isId(p.organisationId)) return null;
  return { cardId: p.cardId, organisationId: p.organisationId };
}

export async function deliverMemberCard(payload: CardPayload, messageId: string): Promise<"sent" | "dropped"> {
  const loaded = await loadCardForRender(payload.cardId);
  if (!loaded || loaded.card.organisationId !== payload.organisationId || loaded.card.revokedAt) return "dropped";
  const org = loaded.ctx.organisation;
  if (!["ACTIVE", "SUSPENDED"].includes(org.status)) return "dropped";
  const member = await prisma.member.findFirst({ where: { id: loaded.card.memberId, organisationId: payload.organisationId, anonymisedAt: null }, select: { email: true, organisation: { select: { memberPortal: true } } } });
  if (!member?.email) return "dropped";
  const holder = loaded.holder;
  const first = holder.displayName.split(/\s+/)[0] || holder.displayName;
  const content = (await orgTemplateContent(payload.organisationId, "card-issued", {
    name: holder.displayName, organisation: org.name, plan: loaded.card.plan.name, unit: loaded.card.member.unit?.name ?? null, cardNumber: loaded.card.cardNumber, validUntil: holder.validUntil,
  })) ?? {
    subject: `Your ${org.name} membership card`,
    heading: "Your membership card",
    paragraphs: [
      `Hi ${first}, your ${loaded.card.plan.name} card from ${org.name} is attached as a PDF. Print it on card stock or keep it on your phone.`,
      "Anyone can scan the QR code on the front to check that your membership is current. Renewing keeps the same card.",
    ],
  };
  const pdf = await renderMemberCard(loaded.input, holder, "pdf", { title: `${holder.displayName} membership card` });
  await sendBrandedEmail({ organisationId: payload.organisationId,
    to: member.email,
    messageId,
    ...content,
    ...(member.organisation.memberPortal ? { action: { label: "See your membership", url: absoluteUrl("/account") } } : {}),
    attachments: [{ filename: `${safeFileName(loaded.card.cardNumber)}-${slugForFile(holder.displayName, "member")}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
  });
  return "sent";
}
