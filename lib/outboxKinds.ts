import "server-only";

import type { Prisma } from "@prisma/client";
import { sendPasswordResetEmail } from "@/lib/email/passwordReset";
import { sendEmailVerificationEmail } from "@/lib/email/emailVerification";
import { asAdminPayload, asInvitePayload, asNoticePayload, deliverAdminApplicationAlert, deliverOrganisationNotice, deliverOwnerInvite } from "@/lib/email/organisation";
import { asMemberInvitePayload, asMembershipNoticePayload, asReminderPayload, deliverMemberInvite, deliverMembershipNotice, deliverRenewalReminder } from "@/lib/email/membership";
import { asPaymentNoticePayload, deliverPaymentNotice } from "@/lib/email/payments";
import { asReportDigestPayload, deliverReportDigest } from "@/lib/email/reportDigest";
import { asMemberCardPayload, deliverMemberCard } from "@/lib/email/memberCard";
import { asVerificationAlertPayload, deliverVerificationAlert } from "@/lib/email/verificationAlert";
import { asErasurePayload, deliverErasureNotice } from "@/lib/email/erasure";
import { asRefundPayload, deliverRefundNotice } from "@/lib/email/refunds";
import { asChatPayload, deliverChatNotice } from "@/lib/chat/notify";
import { asLoginAlertPayload, asLoginCodePayload, deliverLoginAlert, deliverLoginCode } from "@/lib/email/loginSecurity";
import { asOwnershipPayload, deliverOwnershipNotice } from "@/lib/team/ownershipEmail";
import { asLegacyPhotoPurgePayload, asPhotoPurgePayload, deleteFilesWithHistory, purgeErasedMemberPhotos } from "@/lib/storage/memberPhotos";

/** What a handler reports after a delivery attempt. Throw to retry; throw PermanentOutboxError to give up. */
export type DeliveryOutcome = "sent" | "dropped";

export type OutboxKindHandler = {
  /** Payload carries a bearer link (reset, verification, invite): delete the row after sending. */
  capability: boolean;
  /** One-hour links: retry within their lifetime. */
  shortLived?: boolean;
  deliver(payload: Prisma.JsonValue, messageId: string): Promise<DeliveryOutcome>;
};

// ---------- payload checks shared by handlers ----------

export function asRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function isEmail(value: unknown): value is string {
  return isBoundedString(value, 320) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isIsoDate(value: unknown): value is string {
  return isBoundedString(value, 64) && !Number.isNaN(Date.parse(value));
}

export function isSafeMessageUrl(value: unknown): value is string {
  if (!isBoundedString(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:");
  } catch {
    return false;
  }
}

export function isExpired(expiresAt: string | undefined, now = new Date()) {
  return expiresAt !== undefined && new Date(expiresAt) <= now;
}

/** Thrown by a handler for a payload or state that can never be delivered; the row is not retried. */
export class PermanentOutboxError extends Error {
  override name = "PermanentOutboxError";
}

// ---------- kinds ----------

const passwordReset: OutboxKindHandler = {
  capability: true,
  shortLived: true,
  async deliver(value, messageId) {
    const p = asRecord(value);
    if (!p || !isEmail(p.to) || !isSafeMessageUrl(p.resetUrl) || !isIsoDate(p.expiresAt)) throw new PermanentOutboxError();
    if (isExpired(p.expiresAt as string)) return "dropped";
    await sendPasswordResetEmail({ to: p.to as string, resetUrl: p.resetUrl as string, messageId });
    return "sent";
  },
};

const emailVerification: OutboxKindHandler = {
  capability: true,
  shortLived: true,
  async deliver(value, messageId) {
    const p = asRecord(value);
    if (!p || !isEmail(p.to) || !isSafeMessageUrl(p.verificationUrl) || !isIsoDate(p.expiresAt)) throw new PermanentOutboxError();
    if (isExpired(p.expiresAt as string)) return "dropped";
    await sendEmailVerificationEmail({ to: p.to as string, verificationUrl: p.verificationUrl as string, messageId });
    return "sent";
  },
};

const organisationNotice: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asNoticePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverOrganisationNotice(payload, messageId);
  },
};

const organisationApplicationAlert: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asAdminPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverAdminApplicationAlert(payload, messageId);
  },
};

const ownerInvite: OutboxKindHandler = {
  capability: true,
  async deliver(value, messageId) {
    const payload = asInvitePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverOwnerInvite(payload, messageId);
  },
};

const membershipNotice: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asMembershipNoticePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverMembershipNotice(payload, messageId);
  },
};

const renewalReminder: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asReminderPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverRenewalReminder(payload, messageId);
  },
};

const memberInvite: OutboxKindHandler = {
  // The email carries a join link that works on its own, so the row goes once it is sent.
  capability: true,
  async deliver(value, messageId) {
    const payload = asMemberInvitePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverMemberInvite(payload, messageId);
  },
};

const paymentNotice: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asPaymentNoticePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverPaymentNotice(payload, messageId);
  },
};

const memberCard: OutboxKindHandler = {
  // The PDF carries the card's QR, but the row holds only ids and the card is rendered at send time.
  capability: false,
  async deliver(value, messageId) {
    const payload = asMemberCardPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverMemberCard(payload, messageId);
  },
};

const verificationAlert: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asVerificationAlertPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverVerificationAlert(payload, messageId);
  },
};

const erasureNotice: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asErasurePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverErasureNotice(payload, messageId);
  },
};

const refundNotice: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asRefundPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverRefundNotice(payload, messageId);
  },
};

const loginCode: OutboxKindHandler = {
  // The code is a sign-in capability: the row is deleted after sending and retried only while it lasts.
  capability: true,
  shortLived: true,
  async deliver(value, messageId) {
    const payload = asLoginCodePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverLoginCode(payload, messageId);
  },
};

const loginAlert: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asLoginAlertPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverLoginAlert(payload, messageId);
  },
};

const chatNotice: OutboxKindHandler = {
  capability: false,
  async deliver(value) {
    const payload = asChatPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverChatNotice(payload);
  },
};

const reportDigest: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asReportDigestPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverReportDigest(payload, messageId);
  },
};

const ownershipTransfer: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asOwnershipPayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverOwnershipNotice(payload, messageId);
  },
};

const memberPhotoPurge: OutboxKindHandler = {
  // Not an email: an erased member's photos, deleted after the erasure commits and retried until storage agrees.
  capability: false,
  async deliver(value) {
    const payload = asPhotoPurgePayload(value);
    if (!payload) throw new PermanentOutboxError();
    await purgeErasedMemberPhotos(payload);
    return "sent";
  },
};

const legacyPhotoPurge: OutboxKindHandler = {
  // Not an email: a photo's file from before 0.7, deleted once the move to the member's own prefix commits.
  capability: false,
  async deliver(value) {
    const payload = asLegacyPhotoPurgePayload(value);
    if (!payload) throw new PermanentOutboxError();
    await deleteFilesWithHistory(payload.keys);
    return "sent";
  },
};

/** Every email the platform can send, plus the photo purges an erasure or the photo move leaves behind. Add a kind here when a feature needs a new message. */
export const OUTBOX_KINDS = {
  "password-reset": passwordReset,
  "email-verification": emailVerification,
  "organisation-notice": organisationNotice,
  "organisation-application-alert": organisationApplicationAlert,
  "owner-invite": ownerInvite,
  "membership-notice": membershipNotice,
  "renewal-reminder": renewalReminder,
  "member-invite": memberInvite,
  "payment-notice": paymentNotice,
  "report-digest": reportDigest,
  "member-card": memberCard,
  "verification-alert": verificationAlert,
  "erasure-notice": erasureNotice,
  "refund-notice": refundNotice,
  "chat-notice": chatNotice,
  "login-code": loginCode,
  "login-alert": loginAlert,
  "ownership-transfer": ownershipTransfer,
  "member-photo-purge": memberPhotoPurge,
  "legacy-photo-purge": legacyPhotoPurge,
} satisfies Record<string, OutboxKindHandler>;

export type OutboxKind = keyof typeof OUTBOX_KINDS;
