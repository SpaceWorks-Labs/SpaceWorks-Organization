import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { absoluteUrl, sendBrandedEmail } from "./message";

/*
 * "Members waiting for you to verify": one email per import to each unit lead whose reach takes in members the
 * import sent to be verified (lib/membership/importAlerts.ts). A team email, so it goes through the platform's
 * email, never the organisation's own.
 */

type Payload = { organisationId: string; userId: string; count: number };

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

export function asVerificationAlertPayload(value: Prisma.JsonValue): Payload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || !isId(p.organisationId) || !isId(p.userId) || !Number.isInteger(p.count) || (p.count as number) < 1 || (p.count as number) > 100_000) return null;
  return { organisationId: p.organisationId, userId: p.userId, count: p.count as number };
}

/** "dropped" when the person has left the team since, or the organisation is not running. */
export async function deliverVerificationAlert(payload: Payload, messageId: string): Promise<"sent" | "dropped"> {
  const staff = await prisma.teamMember.findFirst({
    where: { organisationId: payload.organisationId, userId: payload.userId },
    select: { unit: { select: { name: true } }, user: { select: { email: true, name: true } }, organisation: { select: { name: true, slug: true, status: true } } },
  });
  if (!staff?.user.email || staff.organisation.status !== "ACTIVE") return "dropped";
  const org = staff.organisation;
  const many = payload.count !== 1;
  const first = staff.user.name?.split(/\s+/)[0];
  const people = `${payload.count} ${many ? "people" : "person"}`;
  await sendBrandedEmail({
    to: staff.user.email,
    messageId,
    subject: `${org.name}: ${payload.count} ${many ? "members" : "member"} to verify`,
    heading: many ? `${payload.count} members are waiting to be verified` : "A member is waiting to be verified",
    paragraphs: [
      `${first ? `Hi ${first}, an` : "An"} import into ${org.name} added ${people}${staff.unit ? ` in ${staff.unit.name}` : ""} waiting for you to verify.`,
      "Check their details, then verify or decline each one. Verifying starts the membership and emails the member their card.",
    ],
    action: { label: "Verify members", url: absoluteUrl(`/dashboard/${org.slug}/members?status=approval`) },
    footnote: `You get this as a ${org.name} team member who verifies new members.`,
  });
  return "sent";
}
