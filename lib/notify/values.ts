import "server-only";

import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/email/message";
import { formatCalendarDate, lastValidDay, localDate } from "@/lib/membership/periods";
import { money } from "@/lib/membership/describe";
import { payLinkToken } from "@/lib/payments/payLink";
import { loadPaymentGuidance } from "@/lib/payments/payGuidance";
import { termTotalMinor } from "@/lib/payments/tax";
import { instructionParagraphs } from "@/lib/payments/unitInstructions";

const day = (at: Date | null, timeZone: string) => (at ? formatCalendarDate(localDate(at, timeZone)) : null);

/**
 * The placeholder values for a message about one membership term. Only what the wording uses: the member's first
 * name, the organisation, the plan and unit, the dates, the amount and the links. `payLink` is the pay page while money
 * is due, and the renewal page (the account, or the public page without member accounts) once a membership has ended.
 */
export async function termMessageValues(termId: string, organisationId: string, options: { pay?: boolean } = {}): Promise<Record<string, string | null> | null> {
  const term = await prisma.membershipTerm.findFirst({
    where: { id: termId, organisationId },
    include: {
      member: { select: { name: true, stateCode: true, unit: { select: { name: true, path: true } } } },
      plan: { select: { name: true, paymentMode: true } },
      organisation: { select: { name: true, slug: true, timezone: true, locale: true, memberPortal: true } },
    },
  });
  if (!term) return null;
  const org = term.organisation;
  const first = term.member.name.split(/\s+/)[0] || term.member.name;
  const card = await prisma.memberCard.findFirst({ where: { organisationId, memberId: term.memberId, planId: term.planId, revokedAt: null }, select: { cardNumber: true } });
  const tax = await prisma.orgTaxSettings.findUnique({ where: { organisationId } });
  const guidance = await loadPaymentGuidance(organisationId, term.member.unit?.path, term.currency, undefined, term.plan.paymentMode);
  const inHandOnly = term.plan.paymentMode === "IN_HAND_ONLY";
  const instructions = inHandOnly || guidance.offlineOnly || options.pay ? instructionParagraphs(guidance).join("\n\n") : "";
  const renew = org.memberPortal ? absoluteUrl("/account") : absoluteUrl(`/o/${org.slug}`);
  const pay = org.memberPortal ? absoluteUrl(`/account/pay/${term.id}`) : absoluteUrl(`/pay/${payLinkToken(term.id)}`);
  return {
    name: first,
    organisation: org.name,
    plan: term.plan.name,
    unit: term.member.unit?.name ?? null,
    cardNumber: card?.cardNumber ?? null,
    validUntil: term.endsAt ? formatCalendarDate(lastValidDay(term.endsAt, org.timezone)) : null,
    graceUntil: day(term.graceUntil, org.timezone),
    dueDate: day(term.paymentDueBy, org.timezone),
    amount: money(termTotalMinor(term, tax, term.currency, term.member.stateCode), term.currency, org.locale),
    // A plan paid in hand only never shows a gateway pay link: the member sees the instructions and the account page.
    payLink: options.pay && !inHandOnly ? pay : renew,
    paymentInstructions: instructions || null,
  };
}
