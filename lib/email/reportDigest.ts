import "server-only";

import type { Prisma } from "@prisma/client";
import { buildDigest } from "@/lib/reports/digest";
import { formatTotals } from "@/lib/reports/money";
import { absoluteUrl, sendBrandedEmail } from "./message";

type Payload = { organisationId: string; userId: string; month: string };

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

export function asReportDigestPayload(value: Prisma.JsonValue): Payload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || !isId(p.organisationId) || !isId(p.userId) || typeof p.month !== "string" || !/^\d{4}-\d{2}$/.test(p.month)) return null;
  return p as Payload;
}

/** Last month in numbers, for one owner, manager or treasurer. "dropped" when they no longer qualify. */
export async function deliverReportDigest(payload: Payload, messageId: string): Promise<"sent" | "dropped"> {
  const digest = await buildDigest(payload);
  if (!digest) return "dropped";
  const m = digest.membership;
  const where = digest.unitName ? `${digest.organisation.name} (${digest.unitName})` : digest.organisation.name;
  const paragraphs = [
    `Hi ${digest.firstName}, here is ${digest.monthLabel} at ${where}.`,
    ...(m ? [`Members: ${m.activeEnd.toLocaleString("en-IN")} active at the end of the month (${m.netChange >= 0 ? "+" : ""}${m.netChange.toLocaleString("en-IN")}), ${m.joined} joined, ${m.renewed} renewed and ${m.lapsed} lapsed.`] : []),
    ...(digest.money ? [`Money: ${formatTotals(digest.money.net, digest.organisation.locale) || "nothing"} collected after refunds, from ${digest.money.payments} payments.`] : []),
    ...(digest.waitingForApproval ? [`${digest.waitingForApproval} ${digest.waitingForApproval === 1 ? "application is" : "applications are"} waiting for a decision.`] : []),
  ];
  await sendBrandedEmail({
    to: digest.to,
    messageId,
    subject: `${digest.organisation.name}: ${digest.monthLabel} in numbers`,
    heading: `${digest.monthLabel} in numbers`,
    paragraphs,
    action: { label: "Open reports", url: absoluteUrl(`/dashboard/${digest.organisation.slug}/reports`) },
    footnote: `You get this as a ${digest.organisation.name} team member. Switch it off on the organisation's overview page.`,
  });
  return "sent";
}
