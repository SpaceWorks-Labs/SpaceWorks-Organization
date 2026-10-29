import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";
import { formatCalendarDate, lastValidDay } from "@/lib/membership/periods";
import { absoluteUrl, sendBrandedEmail } from "./message";
import { orgTemplateContent } from "./orgTemplates";
import { payLinkToken } from "@/lib/payments/payLink";
import { loadPaymentGuidance } from "@/lib/payments/payGuidance";
import { instructionParagraphs } from "@/lib/payments/unitInstructions";
import { termTotalMinor } from "@/lib/payments/tax";

const MEMBERSHIP_NOTICES = [
  "application-received",
  "payment-requested",
  "approved-pay-now",
  "activated",
  "renewal-confirmed",
  "rejected",
  "revoked",
  "left",
] as const;

type MembershipNotice = (typeof MEMBERSHIP_NOTICES)[number];

type NoticePayload = { termId: string; organisationId: string; notice: MembershipNotice };
type ReminderPayload = { termId: string; organisationId: string; key: string };

function record(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

export function asMembershipNoticePayload(value: Prisma.JsonValue): NoticePayload | null {
  const p = record(value);
  if (!p || !isId(p.termId) || !isId(p.organisationId) || !MEMBERSHIP_NOTICES.includes(p.notice as MembershipNotice)) return null;
  return p as NoticePayload;
}

export function asReminderPayload(value: Prisma.JsonValue): ReminderPayload | null {
  const p = record(value);
  if (!p || !isId(p.termId) || !isId(p.organisationId) || typeof p.key !== "string" || !/^(before|after)-\d{1,3}$/.test(p.key)) return null;
  return p as ReminderPayload;
}

async function loadTerm(termId: string, organisationId: string) {
  return prisma.membershipTerm.findFirst({
    where: { id: termId, organisationId },
    include: {
      member: { select: { id: true, name: true, email: true, anonymisedAt: true, stateCode: true, unit: { select: { path: true, name: true } } } },
      plan: { select: { name: true } },
      organisation: { select: { name: true, slug: true, timezone: true, locale: true, status: true, memberPortal: true } },
    },
  });
}

function money(minor: number, currency: string, locale: string | null) {
  return isCurrencyCode(currency) ? formatMoney(minor, currency, locale ?? undefined) : `${currency} ${minor}`;
}

async function activatedTemplate(term: NonNullable<Awaited<ReturnType<typeof loadTerm>>>, organisation: string, until: string | null) {
  const card = await prisma.memberCard.findFirst({ where: { organisationId: term.organisationId, memberId: term.member.id, planId: term.planId, revokedAt: null }, select: { cardNumber: true } });
  return orgTemplateContent(term.organisationId, "membership-activated", {
    name: term.member.name, organisation, plan: term.plan.name, unit: term.member.unit?.name ?? null, cardNumber: card?.cardNumber ?? null, validUntil: until,
  });
}

/** Tell a member what happened to their application or membership. "dropped" when there is no one to tell. */
export async function deliverMembershipNotice(payload: NoticePayload, messageId: string): Promise<"sent" | "dropped"> {
  const term = await loadTerm(payload.termId, payload.organisationId);
  if (!term || term.member.anonymisedAt) return "dropped";
  const org = term.organisation;
  const home = absoluteUrl(`/o/${org.slug}`);
  // Without member accounts, links go to the public page and "Pay now" carries a signed pay link.
  const account = org.memberPortal ? absoluteUrl("/account") : home;
  const payUrl = org.memberPortal ? absoluteUrl(`/account/pay/${term.id}`) : absoluteUrl(`/pay/${payLinkToken(term.id)}`);
  // Tax included, so the email asks for what the payment collects.
  const tax = await prisma.orgTaxSettings.findUnique({ where: { organisationId: payload.organisationId } });
  const due = money(termTotalMinor(term, tax, term.currency, term.member.stateCode), term.currency, org.locale);
  const until = term.endsAt ? formatCalendarDate(lastValidDay(term.endsAt, org.timezone)) : null;
  const first = term.member.name.split(/\s+/)[0] || term.member.name;
  // Asking for money: say how to pay offline (the nearest unit's instructions, else the organisation's).
  const howToPay = payload.notice === "payment-requested" || payload.notice === "approved-pay-now"
    ? instructionParagraphs(await loadPaymentGuidance(payload.organisationId, term.member.unit?.path, term.currency))
    : [];
  const content = {
    "application-received": {
      subject: `Your application to ${org.name}`,
      heading: "Application received",
      paragraphs: [`Hi ${first}, thanks for applying for ${term.plan.name} with ${org.name}. Their team will review it and we will email you the decision.`],
      action: { label: `Visit ${org.name}`, url: home },
    },
    "payment-requested": {
      subject: `Complete your ${org.name} membership`,
      heading: "One step left: payment",
      paragraphs: [`Hi ${first}, your ${term.plan.name} membership starts once ${due} is paid.`, ...howToPay],
      action: { label: "Pay now", url: payUrl },
    },
    "approved-pay-now": {
      subject: `You're approved for ${org.name}`,
      heading: "You're approved",
      paragraphs: [`Hi ${first}, ${org.name} approved your application for ${term.plan.name}. Pay ${due} to start your membership.`, ...howToPay],
      action: { label: "Pay now", url: payUrl },
    },
    activated: {
      subject: `Welcome to ${org.name}`,
      heading: "Your membership has started",
      paragraphs: [`Hi ${first}, your ${term.plan.name} membership with ${org.name} is active${until ? ` until ${until}` : ""}.`],
      action: { label: "See your membership", url: account },
    },
    "renewal-confirmed": {
      subject: `${org.name} renewal confirmed`,
      heading: "Renewal confirmed",
      paragraphs: [`Hi ${first}, your ${term.plan.name} renewal is confirmed${until ? `. It runs until ${until}` : ""}. Your card stays the same.`],
      action: { label: "See your membership", url: account },
    },
    rejected: {
      subject: `Your application to ${org.name}`,
      heading: "Application not approved",
      paragraphs: [`Hi ${first}, ${org.name} did not approve your application for ${term.plan.name}.`, ...(term.reason ? [`Their note: ${term.reason}`] : [])],
      action: { label: `Visit ${org.name}`, url: home },
    },
    revoked: {
      subject: `Your ${org.name} membership`,
      heading: "Membership revoked",
      paragraphs: [`Hi ${first}, ${org.name} has revoked your ${term.plan.name} membership.`, ...(term.reason ? [`Their note: ${term.reason}`] : [])],
      action: { label: "See your account", url: account },
    },
    left: {
      subject: `You've left ${org.name}`,
      heading: "Membership ended",
      paragraphs: [`Hi ${first}, you ended your ${term.plan.name} membership with ${org.name} from your account. Payments already made stay on record; ask ${org.name} if you expect a refund.`],
      action: { label: `Visit ${org.name}`, url: home },
    },
  }[payload.notice];
  // An organisation's own wording for the activation notice replaces the subject, heading and text.
  const own = payload.notice === "activated" ? await activatedTemplate(term, org.name, until) : null;
  await sendBrandedEmail({ organisationId: payload.organisationId, to: term.member.email, messageId, ...content, ...own });
  return "sent";
}

/** A renewal reminder before or after a term ends. Dropped once the member has renewed or the term changed. */
export async function deliverRenewalReminder(payload: ReminderPayload, messageId: string): Promise<"sent" | "dropped"> {
  const term = await loadTerm(payload.termId, payload.organisationId);
  if (!term || term.member.anonymisedAt || !term.endsAt || !["ACTIVE", "GRACE", "LAPSED"].includes(term.status)) return "dropped";
  // Renewed, or rejoined with a new term that starts after this one.
  const renewed = await prisma.membershipTerm.count({ where: { OR: [{ renewedFromId: term.id, status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED"] } }, { memberId: term.memberId, planId: term.planId, status: { in: ["UPCOMING", "ACTIVE", "GRACE"] }, startsAt: { gte: term.endsAt } }] } });
  if (renewed > 0) return "dropped";
  const org = term.organisation;
  const until = formatCalendarDate(lastValidDay(term.endsAt, org.timezone));
  const after = payload.key.startsWith("after");
  // Without a gateway that takes the currency the renewal is paid offline, so say how.
  const guidance = await loadPaymentGuidance(payload.organisationId, term.member.unit?.path, term.currency);
  const howToPay = guidance.offlineOnly ? instructionParagraphs(guidance) : [];
  await sendBrandedEmail({ organisationId: payload.organisationId,
    to: term.member.email,
    messageId,
    subject: after ? `Your ${org.name} membership has ended` : `Renew your ${org.name} membership`,
    heading: after ? "Your membership has ended" : "Time to renew",
    paragraphs: [
      after
        ? `Your ${term.plan.name} membership ended on ${until}. Renew now to keep your card valid.`
        : `Your ${term.plan.name} membership is valid until ${until}. Renew now and the new year starts the day after.`,
      ...howToPay,
    ],
    action: org.memberPortal ? { label: "Renew now", url: absoluteUrl("/account") } : { label: `Contact ${org.name} to renew`, url: absoluteUrl(`/o/${org.slug}`) },
  });
  return "sent";
}

type InvitePayload = { inviteId: string; organisationId: string };

export function asMemberInvitePayload(value: Prisma.JsonValue): InvitePayload | null {
  const p = record(value);
  if (!p || !isId(p.inviteId) || !isId(p.organisationId)) return null;
  return p as InvitePayload;
}

/** Email a personal join invite. Dropped once it is revoked, used or expired. */
export async function deliverMemberInvite(payload: InvitePayload, messageId: string): Promise<"sent" | "dropped"> {
  const invite = await prisma.memberInvite.findFirst({
    where: { id: payload.inviteId, organisationId: payload.organisationId },
    include: { plan: { select: { name: true, slug: true, organisation: { select: { name: true, slug: true, status: true } } } } },
  });
  if (!invite?.email || invite.revokedAt || invite.uses >= invite.maxUses || (invite.expiresAt && invite.expiresAt <= new Date())) return "dropped";
  const org = invite.plan.organisation;
  if (org.status !== "ACTIVE") return "dropped";
  await sendBrandedEmail({ organisationId: payload.organisationId,
    to: invite.email,
    messageId,
    subject: `You're invited to join ${org.name}`,
    heading: `Join ${org.name}`,
    paragraphs: [`${org.name} has invited you to become a member on their ${invite.plan.name} plan. Sign in or create an account with ${invite.email} to accept.`],
    action: { label: "Accept the invitation", url: absoluteUrl(`/o/${org.slug}/join/${invite.plan.slug}?invite=${invite.token}`) },
    footnote: invite.expiresAt ? `This invitation works until ${formatCalendarDate({ year: invite.expiresAt.getUTCFullYear(), month: invite.expiresAt.getUTCMonth() + 1, day: invite.expiresAt.getUTCDate() })}.` : undefined,
  });
  return "sent";
}
