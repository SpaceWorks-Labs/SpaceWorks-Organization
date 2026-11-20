import "server-only";

import type { OutboxClient } from "@/lib/outbox";
import { cleanRouting, type Routing } from "@/lib/messages/kinds";

export type OrgMessaging = { routing: Routing; quietStart: number | null; quietEnd: number | null };

/** The organisation's routing and quiet hours; every kind goes by email until it chooses otherwise. */
export async function loadOrgMessaging(client: OutboxClient, organisationId: string): Promise<OrgMessaging> {
  const row = await client.orgMessagingSettings.findUnique({ where: { organisationId }, select: { routing: true, quietStartMinute: true, quietEndMinute: true } });
  return { routing: cleanRouting(row?.routing), quietStart: row?.quietStartMinute ?? null, quietEnd: row?.quietEndMinute ?? null };
}

/** The saved wording for one kind, or null for the standard wording. */
export async function loadOrgTemplate(client: OutboxClient, organisationId: string, kind: string) {
  return client.orgEmailTemplate.findUnique({ where: { organisationId_kind: { organisationId, kind } }, select: { subject: true, heading: true, body: true, shortText: true } });
}

/** The approved WhatsApp template for a kind in the first language that has one, from the sender's own scope (organisation or platform). */
export async function loadWhatsAppTemplate(client: OutboxClient, scopeOrgId: string | null, kind: string, languages: string[]) {
  const rows = await client.whatsAppTemplate.findMany({ where: { organisationId: scopeOrgId, kind }, select: { language: true, name: true, variables: true } });
  for (const language of languages) {
    const row = rows.find((item) => item.language.split("_")[0].toLowerCase() === language);
    if (row) return row;
  }
  return null;
}

/** The two-letter language a member's messages are sent in: the organisation's locale, else English. */
export function messageLanguages(locale: string | null): string[] {
  const own = locale?.split(/[-_]/)[0]?.toLowerCase();
  return [...new Set([...(own && /^[a-z]{2}$/.test(own) ? [own] : []), "en"])];
}

