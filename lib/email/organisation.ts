import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ORGANISATION_NOTICES, type OrganisationNotice } from "@/lib/organisationLifecycle";
import { absoluteUrl, sendBrandedEmail } from "./message";

type NoticePayload = { to: string; organisationId: string; notice: OrganisationNotice; reason?: string };
type AdminPayload = { to: string; organisationId: string; resubmitted?: boolean };
type InvitePayload = { to: string; organisationId: string; token: string; expiresAt: string };

function record(value: Prisma.JsonValue): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

export function asNoticePayload(value: Prisma.JsonValue): NoticePayload | null {
  const p = record(value);
  if (!p || !isText(p.to, 320) || !isText(p.organisationId, 64) || !ORGANISATION_NOTICES.includes(p.notice as OrganisationNotice)) return null;
  if (p.reason !== undefined && !isText(p.reason, 2000)) return null;
  return p as NoticePayload;
}

export function asAdminPayload(value: Prisma.JsonValue): AdminPayload | null {
  const p = record(value);
  if (!p || !isText(p.to, 320) || !isText(p.organisationId, 64)) return null;
  return p as AdminPayload;
}

export function asInvitePayload(value: Prisma.JsonValue): InvitePayload | null {
  const p = record(value);
  if (!p || !isText(p.to, 320) || !isText(p.organisationId, 64) || !isText(p.token, 256) || !isText(p.expiresAt, 64)) return null;
  return p as InvitePayload;
}

async function organisation(id: string) {
  return prisma.organisation.findUnique({ where: { id }, select: { name: true, slug: true } });
}

/** Tell an owner about their application or organisation. Returns "dropped" if the organisation is gone. */
export async function deliverOrganisationNotice(payload: NoticePayload, messageId: string): Promise<"sent" | "dropped"> {
  const org = await organisation(payload.organisationId);
  if (!org) return "dropped";
  const application = absoluteUrl(`/dashboard/${org.slug}/application`);
  const dashboard = absoluteUrl(`/dashboard/${org.slug}`);
  const reason = payload.reason ? [`Note from the platform team: ${payload.reason}`] : [];
  const content = {
    received: {
      subject: `We received the application for ${org.name}`,
      heading: "Application received",
      paragraphs: [`Thanks for applying to run ${org.name} on Space Works Organization. A platform admin will review it and we will email you when there is a decision.`],
      action: { label: "View your application", url: application },
    },
    approved: {
      subject: `${org.name} is approved`,
      heading: "You're approved",
      paragraphs: [`${org.name} can now run its memberships here. Start by adding your logo, creating a membership plan and sharing your join link.`],
      action: { label: "Open your dashboard", url: dashboard },
    },
    "changes-requested": {
      subject: `Changes needed for ${org.name}`,
      heading: "A few changes needed",
      paragraphs: [`The platform team needs a few changes before ${org.name} can be approved.`, ...reason, "Update your application and send it again."],
      action: { label: "Update your application", url: application },
    },
    rejected: {
      subject: `Your application for ${org.name}`,
      heading: "Application not approved",
      paragraphs: [`The application for ${org.name} was not approved.`, ...reason, "If you think this is a mistake, reply to the platform operator."],
      action: { label: "View your application", url: application },
    },
    suspended: {
      subject: `${org.name} is suspended`,
      heading: "Organisation suspended",
      paragraphs: [`${org.name} has been suspended. New members cannot join and most changes are paused. Money already received is still receipted, and members can still see their records.`, ...reason],
      action: { label: "View status", url: application },
    },
    reactivated: {
      subject: `${org.name} is active again`,
      heading: "Organisation reactivated",
      paragraphs: [`${org.name} is active again. Everything works as before.`],
      action: { label: "Open your dashboard", url: dashboard },
    },
    "payee-changed": {
      subject: `The UPI payee for ${org.name} changed`,
      heading: "UPI payee changed",
      paragraphs: [`Someone on the team changed the UPI ID or payee name that members of ${org.name} pay to. Open the audit log to see who.`, "If this wasn't expected, change your password and review your team."],
      action: { label: "Review payment settings", url: absoluteUrl(`/dashboard/${org.slug}/settings/payments`) },
    },
    created: {
      subject: `${org.name} is ready`,
      heading: "Your organisation is ready",
      paragraphs: [`A platform admin set up ${org.name} for you on Space Works Organization.`],
      action: { label: "Open your dashboard", url: dashboard },
    },
  }[payload.notice];
  await sendBrandedEmail({ to: payload.to, messageId, ...content });
  return "sent";
}

/** Tell a platform admin that an application is waiting. */
export async function deliverAdminApplicationAlert(payload: AdminPayload, messageId: string): Promise<"sent" | "dropped"> {
  const org = await organisation(payload.organisationId);
  if (!org) return "dropped";
  await sendBrandedEmail({
    to: payload.to,
    messageId,
    subject: `${payload.resubmitted ? "Updated application" : "New organisation application"}: ${org.name}`,
    heading: payload.resubmitted ? "An application was updated" : "A new organisation applied",
    paragraphs: [`${org.name} ${payload.resubmitted ? "updated its application after your requested changes" : "wants to run its memberships on this platform"}. Review it to approve, ask for changes or decline.`],
    action: { label: "Review the application", url: absoluteUrl(`/super-admin/orgs/${payload.organisationId}`) },
  });
  return "sent";
}

/** Invite the person a platform admin named as owner of a new organisation. */
export async function deliverOwnerInvite(payload: InvitePayload, messageId: string): Promise<"sent" | "dropped"> {
  const org = await organisation(payload.organisationId);
  if (!org || new Date(payload.expiresAt) <= new Date()) return "dropped";
  await sendBrandedEmail({
    to: payload.to,
    messageId,
    subject: `You're invited to run ${org.name}`,
    heading: `Run ${org.name} on Space Works Organization`,
    paragraphs: [`A platform admin set up ${org.name} and named you as its owner. Accept the invite with this email address to open its dashboard and start running its memberships.`],
    action: { label: "Accept the invite", url: absoluteUrl(`/join/org/${payload.token}`) },
    footnote: `This link works once and expires on ${new Date(payload.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Sign in or create an account with ${payload.to} to accept it.`,
  });
  return "sent";
}
