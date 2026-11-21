import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { certificateVerifyPath } from "@/lib/certificates/core";
import { loadCertificateForRender } from "@/lib/certificates/data";
import { renderCertificate } from "@/lib/certificates/render";
import { safeFileName, slugForFile } from "@/lib/downloads";
import { deliverMemberMessage } from "@/lib/notify/deliver";
import { PermanentOutboxError, type OutboxKindHandler } from "@/lib/outboxKinds";
import { absoluteUrl } from "./message";
import { orgTemplateContent } from "./orgTemplates";

/*
 * "Email certificate": the certificate as a PDF attachment, queued by staff who issue certificates. The row holds
 * only ids; the certificate is rendered when the email goes out, and one revoked meanwhile is never sent. The
 * wording is the organisation's "certificate-issued" template when it has one. The email links to the member's
 * account (when the organisation has member accounts) and to the public check page.
 */

type CertificatePayload = { certificateId: string; organisationId: string };

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;

export function asCertificatePayload(value: Prisma.JsonValue): CertificatePayload | null {
  const p = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!p || !isId(p.certificateId) || !isId(p.organisationId)) return null;
  return { certificateId: p.certificateId, organisationId: p.organisationId };
}

export async function deliverCertificate(payload: CertificatePayload, messageId: string): Promise<"sent" | "dropped"> {
  const loaded = await loadCertificateForRender(payload.certificateId);
  if (!loaded || loaded.certificate.organisationId !== payload.organisationId || loaded.certificate.revokedAt) return "dropped";
  const org = loaded.ctx.organisation;
  if (!["ACTIVE", "SUSPENDED"].includes(org.status)) return "dropped";
  const member = await prisma.member.findFirst({ where: { id: loaded.certificate.memberId, organisationId: payload.organisationId, anonymisedAt: null }, select: { email: true, organisation: { select: { memberPortal: true } } } });
  if (!member?.email) return "dropped";
  const { certificate } = loaded;
  const first = certificate.member.name.split(/\s+/)[0] || certificate.member.name;
  const values = { name: first, organisation: org.name, plan: certificate.member.terms[0]?.plan.name ?? null, unit: certificate.member.unit?.name ?? null, certificate: certificate.title, certificateNumber: certificate.certificateNumber };
  const content = (await orgTemplateContent(payload.organisationId, "certificate-issued", values)) ?? {
    subject: `Your certificate from ${org.name}`,
    heading: "Your certificate",
    paragraphs: [
      `Hi ${first}, ${org.name} has given you a certificate: ${certificate.title}. It is attached as a PDF.`,
      "Anyone can scan the QR code on it to check that it is genuine.",
    ],
  };
  const pdf = await renderCertificate(loaded.input, "pdf", `${certificate.title} - ${certificate.member.name}`);
  const check = absoluteUrl(certificateVerifyPath(certificate.verifyToken));
  // Through the organisation's routing for "certificate issued": the PDF goes by email; other channels carry the short text.
  return deliverMemberMessage({ organisationId: payload.organisationId, memberId: certificate.memberId, kind: "certificate-issued", values, dedupeKey: `certificate:${messageId}` }, messageId, {
    email: {
      ...content,
      ...(member.organisation.memberPortal ? { action: { label: "See your certificates", url: absoluteUrl("/account") } } : {}),
      footnote: `Check this certificate: ${check}`,
      attachments: [{ filename: `${safeFileName(certificate.certificateNumber)}-${slugForFile(certificate.member.name, "member")}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
    },
  });
}

/** The outbox handler (lib/outboxKinds.ts): the row holds only ids, and the certificate is rendered when it is sent. */
export const certificateEmail: OutboxKindHandler = {
  capability: false,
  async deliver(value, messageId) {
    const payload = asCertificatePayload(value);
    if (!payload) throw new PermanentOutboxError();
    return deliverCertificate(payload, messageId);
  },
};
