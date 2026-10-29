import "server-only";

import { prisma } from "@/lib/db";
import { renderEmailTemplate, type EmailTemplateKind, type PlaceholderValues } from "./templates";

/**
 * The organisation's own wording for one member email, filled in for one member, or null when it uses the
 * standard wording (no saved template).
 */
export async function orgTemplateContent(organisationId: string, kind: EmailTemplateKind, values: PlaceholderValues) {
  const template = await prisma.orgEmailTemplate.findUnique({ where: { organisationId_kind: { organisationId, kind } }, select: { subject: true, heading: true, body: true } });
  return template ? renderEmailTemplate(template, values) : null;
}
