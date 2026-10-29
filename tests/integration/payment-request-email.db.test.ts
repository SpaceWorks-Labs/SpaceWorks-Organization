import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ emails: [] as Array<{ paragraphs?: string[] }> }));
vi.mock("@/lib/email/message", async (original) => ({
  ...(await original<typeof import("@/lib/email/message")>()),
  sendBrandedEmail: async (email: { paragraphs?: string[] }) => { sent.emails.push(email); },
}));

import { prisma } from "@/lib/db";
import { deliverMembershipNotice } from "@/lib/email/membership";
import { formatMoney } from "@/lib/money/currencies";
import type { OrgForPayments } from "@/lib/payments/charges";
import { at, createPaymentsOrg, removePaymentsOrg, unpaidTerm } from "./payments-helpers";

// The email asking for payment states what the payment collects: under exclusive GST, the price plus tax.
let org: OrgForPayments;
let plan: Awaited<ReturnType<typeof createPaymentsOrg>>["plan"];

beforeAll(async () => {
  ({ org, plan } = await createPaymentsOrg());
  await prisma.orgTaxSettings.update({ where: { organisationId: org.id }, data: { inclusive: false } });
});

afterAll(async () => {
  if (org) await removePaymentsOrg(org.id);
  await prisma.$disconnect();
});

describe("payment request email", () => {
  it("asks for the amount with tax", async () => {
    const term = await unpaidTerm(org, plan, "rahul", at("2026-06-15T06:00:00Z"));
    expect(await deliverMembershipNotice({ termId: term.id, organisationId: org.id, notice: "payment-requested" }, "m1")).toBe("sent");
    const text = sent.emails[0]?.paragraphs?.join(" ") ?? "";
    expect(text).toContain(formatMoney(139_240, "INR", org.locale ?? undefined));
    expect(text).not.toContain(formatMoney(118_000, "INR", org.locale ?? undefined));
  });
});
